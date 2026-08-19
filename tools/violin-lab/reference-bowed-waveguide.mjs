import { DelayLine, PinkNoise, Biquad, DcBlock, softClip } from "./dsp.mjs";

const BODY48 = [
  [ 1.000000,  1.565450, 0.344281, -0.523286, -0.423487],
  [ 1.000000, -1.957419, 0.957842, -1.680339,  0.879621],
  [ 1.000000, -1.709473, 0.894014, -1.792976,  0.883152],
  [ 1.000000, -1.877666, 0.968074, -1.869224,  0.955444],
  [ 1.000000, -1.937891, 0.965125, -1.942307,  0.962268],
  [ 1.000000, -1.982273, 0.989705, -1.988195,  0.992923],
];
const Q_STRING=90, K_REF=8, BETA=0.1272;
const MU_S=0.8, MU_D=0.3, V0=0.10, RHO_MAX=0.98, PHI_PER_VB=1.65;
const SEED_FRAC = 0.85;     // seed amplitude as a fraction of v_b

export function makeVoice({ sampleRate: sr, frequency, velocity, rng, seedString = true, noiseGain = 0.30 }) {
  const f0 = Math.max(150, Math.min(1200, frequency));
  const w0 = 2*Math.PI*f0/sr;
  const g0 = Math.exp(-Math.PI/Q_STRING);
  const r  = Math.exp(-Math.PI*(K_REF-1)/Q_STRING), r2=r*r;
  const wk = Math.min(0.95*Math.PI, K_REF*w0), c = Math.cos(wk);
  const B  = (2*r2*c-2)/(1-r2);
  let p = (-B - Math.sqrt(Math.max(0,B*B-4)))/2;
  if (!(p>-0.99 && p<0.99)) p = (-B + Math.sqrt(Math.max(0,B*B-4)))/2;
  p = Math.max(-0.95, Math.min(0.95, p));
  const b0 = g0*(1-p);
  const dFilt = Math.atan2(p*Math.sin(w0), 1-p*Math.cos(w0))/w0;
  const total = sr/f0 - dFilt;
  const dBr = Math.max(1.5, total*BETA), dNk = Math.max(1.5, total-dBr);

  const neck = new DelayLine(sr/140+8), bridge = new DelayLine(sr/140+8);
  const body = BODY48.map(([q0,q1,q2,p1,p2])=>{const q=new Biquad(sr);q.b0=q0;q.b1=q1;q.b2=q2;q.a1=p1;q.a2=p2;return q;});
  const pink = new PinkNoise(rng);
  const noiseBp = new Biquad(sr).bandpass(2200, 0.7);
  const dcb = new DcBlock(0.999);

  const vbFull = 0.14 + 0.14*Math.max(0,Math.min(1,velocity));
  const phi = PHI_PER_VB*vbFull;

  // --- seed both delay lines with one period of Helmholtz sawtooth ---------
  if (seedString) {
    const A = SEED_FRAC*vbFull;
    const nN = Math.ceil(dNk), nB = Math.ceil(dBr);
    const saw = (ph)=>{ const x = ph - Math.floor(ph); return x < 1-BETA ? A*(2*x/(1-BETA)-1) : A*(1-2*(x-(1-BETA))/BETA); };
    for (let i=0;i<nN;i++) neck.push(saw(i/total));
    for (let i=0;i<nB;i++) bridge.push(saw((dNk+i)/total));
  }

  let lz=0, injDc=0, t=0;
  const kDc = 2*Math.PI*8/sr;
  let releasing=false, relT=0, env=0, relFrom=0;
  const ATT=0.035, REL=0.13;
  let vibP=rng()*6.283, wobP=rng()*6.283, wob2P=rng()*6.283;
  const stats={min:1e9,max:-1e9,stick:0,n:0};
  return { stats,
    next(){
      const dt=1/sr;
      if(!releasing){ env=Math.min(1,t/ATT); relFrom=env; } else { env=relFrom*Math.exp(-3*relT/REL); relT+=dt; }
      const vibDepth=0.0035*Math.min(1,Math.max(0,(t-0.10)/0.35));
      const vib=Math.sin(vibP)*vibDepth; vibP+=2*Math.PI*5.4*dt;
      const wob=1+0.05*Math.sin(wobP)+0.035*Math.sin(wob2P);
      wobP+=2*Math.PI*4.3*dt; wob2P+=2*Math.PI*6.9*dt;

      const bOut=bridge.read(dBr*(1-vib)), nOut=neck.read(dNk*(1-vib));
      lz=b0*bOut+p*lz;
      const br=-lz, nr=-nOut, vS=br+nr;
      const vb=vbFull*env;
      let dv=vb-vS;
      const a0=Math.abs(dv);
      // friction noise: injected into the string, proportional to slip speed
      const slip = Math.max(0, a0 - phi*MU_S);
      const nz = pink.next();
      dv += 0.05*nz*slip*env;
      const a=Math.abs(dv);
      const mu=MU_D+(MU_S-MU_D)/(1+a/V0);
      const rho=Math.min(RHO_MAX, phi*env*wob*mu/(a+1e-12));
      let inject=dv*rho;
      injDc+=(inject-injDc)*kDc; inject-=injDc;
      neck.push(br+inject); bridge.push(nr+inject);

      // parallel bow-scrape noise, gated by slip, radiated through the body
      const scrape = noiseBp.process(nz*(1-rho)*a*env)*noiseGain;
      let y=bOut+scrape;
      for(const s of body) y=s.process(y);
      t+=dt;
      if(t>0.5&&!releasing){stats.n++;if(rho>=RHO_MAX*0.999)stats.stick++;stats.min=Math.min(stats.min,bOut);stats.max=Math.max(stats.max,bOut);}
      return dcb.process(softClip(y*0.55))*0.9;
    },
    release(){ if(!releasing){releasing=true;relT=0;} },
    finished(){ return releasing && relFrom*Math.exp(-3*relT/REL)<1e-4; },
  };
}
