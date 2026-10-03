// Browser port of the ournotes-boxlens v0.1.0 identity/geometry detector (Engine.identify, ui_bbox).
// Feature matching and geometry run inside the supplied OpenCV WASM module.
export function canonicalId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || value.length > 19 ||
      (value.length === 19 && value > '9223372036854775807')) throw new Error('invalidCanonicalId');
  return value;
}

export function binding(value) {
  for (const key of ['jobId', 'inputRevision', 'datasetId', 'galleryId']) {
    if (typeof value?.[key] !== 'string' || !value[key]) throw new Error('invalidBinding:' + key);
  }
  return Object.freeze(Object.fromEntries(['jobId', 'inputRevision', 'datasetId', 'galleryId'].map(key => [key, value[key]])));
}

export const sameBinding = (a, b) => ['jobId', 'inputRevision', 'datasetId', 'galleryId'].every(key => a?.[key] === b?.[key]);
export const overlap = (a, b) => Math.max(0, Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])) *
  Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1])) / Math.max(1,Math.min(a[2]*a[3],b[2]*b[3]));
const round = (number, digits) => Number(number.toFixed(digits));
const own = value => { if (!value || typeof value.delete !== 'function') throw new Error('invalidWasmObject'); return value; };

export function uiBox(card, box) {
  const [x,y,w,h] = box;
  if (card.kind !== 'snap') return box.slice();
  const art = card.width/card.height, frame = 314/172;
  if (art < frame) { const fh = h*art/frame; return [x,y+(h-fh)/2,w,fh]; }
  const fw = w*frame/art; return [x+(w-fw)/2,y,fw,h];
}

// List frames measure 224x294 (Member) and 326x184 (Snap); the artwork sits
// centred inside, about 12 pixels smaller in each dimension. frameBox returns
// the outer frame; uiBox returns the inner artwork box used for field crops.
export function frameBox(kind, inner) {
  const [x,y,w,h]=inner, width=kind==='member'?212:314, height=kind==='member'?282:172;
  return [x-6*w/width,y-6*h/height,w*(width+12)/width,h*(height+12)/height];
}

// NumPy's contiguous float32 pairwise reduction for a 128-column descriptor.
export function rootSift(descriptors, rows) {
  const out = new Float32Array(rows*128), f = Math.fround;
  for (let row=0;row<rows;row++) {
    const start=row*128, lanes=Array.from(descriptors.subarray(start,start+8));
    for (let j=8;j<128;j+=8) for (let lane=0;lane<8;lane++) lanes[lane]=f(lanes[lane]+descriptors[start+j+lane]);
    const sum=f(f(f(lanes[0]+lanes[1])+f(lanes[2]+lanes[3]))+f(f(lanes[4]+lanes[5])+f(lanes[6]+lanes[7])));
    const denominator=f(sum+f(1e-8));
    for (let col=0;col<128;col++) out[start+col]=f(Math.sqrt(f(descriptors[start+col]/denominator)));
  }
  return out;
}

const HEX64=/^[a-f0-9]{64}$/;

// Gallery artwork is an immutable asset-service file (`file`, relative to the
// service root; `assetPath` names the published asset it was taken from). Its
// byte length and SHA-256 are checked before decoding. "fit" crops `box`
// ([left, top, right, bottom] in source pixels) and resamples it to the card size;
// "direct" uses the decoded image as is.
export function artworkRecord(card) {
  const art=card?.art, derive=art?.derive;
  if (!art || typeof art.file!=='string' || !/^[A-Za-z0-9-]+(\/[A-Za-z0-9_.-]+)+$/.test(art.file) || art.file.split('/').includes('..') ||
      !Number.isSafeInteger(art.bytes) || art.bytes<1 || !HEX64.test(art.sha256) ||
      !Number.isSafeInteger(art.width) || art.width<1 || !Number.isSafeInteger(art.height) || art.height<1) throw new Error('invalidGalleryArtwork');
  if (derive?.method==='direct') {
    if (art.width!==card.width || art.height!==card.height) throw new Error('invalidGalleryArtwork');
  } else if (derive?.method==='fit') {
    const box=derive.box;
    if (derive.filter!=='lanczos3' || !Array.isArray(box) || box.length!==4 || !box.every(value=>typeof value==='number' && Number.isFinite(value)) ||
        box[0]<0 || box[1]<0 || !(box[2]>box[0]) || !(box[3]>box[1]) || box[2]>art.width || box[3]>art.height) throw new Error('invalidGalleryArtwork');
  } else throw new Error('invalidGalleryArtwork');
  return art;
}

// Separable Lanczos-3 resampling with 8-bit fixed-point coefficients, the same
// arithmetic as Pillow's Image.resize(size, LANCZOS, box): float32 box edges,
// support widened by the downscale factor, and an 8-bit intermediate row pass.
const PRECISION_BITS=22;
const sinc=x=>{if (x===0) return 1;x*=Math.PI;return Math.sin(x)/x;};
const lanczos=x=>-3<=x && x<3?sinc(x)*sinc(x/3):0;
function coefficients(inSize,start,end,outSize) {
  const f=Math.fround, in0=f(start), scale=f(f(end)-in0)/outSize, filterScale=Math.max(scale,1);
  const support=3*filterScale, inverse=1/filterScale, size=Math.ceil(support)*2+1, bounds=new Int32Array(outSize*2), weights=new Int32Array(outSize*size);
  for (let out=0;out<outSize;out++) {
    const center=in0+(out+.5)*scale;
    let min=Math.trunc(center-support+.5), max=Math.trunc(center+support+.5);
    if (min<0) min=0; if (max>inSize) max=inSize; max-=min;
    const row=new Float64Array(max);let total=0;
    for (let x=0;x<max;x++) {row[x]=lanczos((x+min-center+.5)*inverse);total+=row[x];}
    for (let x=0;x<max;x++) {
      const value=(total!==0?row[x]/total:row[x])*(1<<PRECISION_BITS);
      weights[out*size+x]=Math.trunc(value<0?value-.5:value+.5);
    }
    bounds[out*2]=min;bounds[out*2+1]=max;
  }
  return {bounds,weights,size};
}
const clip8=value=>value>=(1<<PRECISION_BITS<<8)?255:value<=0?0:value>>PRECISION_BITS;

export function fitArtwork(rgba,width,height,box,outWidth,outHeight) {
  if (!(rgba instanceof Uint8ClampedArray || rgba instanceof Uint8Array) || rgba.length!==width*height*4) throw new Error('invalidArtworkPixels');
  const horizontal=coefficients(width,box[0],box[2],outWidth), vertical=coefficients(height,box[1],box[3],outHeight);
  const first=vertical.bounds[0], last=vertical.bounds[outHeight*2-2]+vertical.bounds[outHeight*2-1], rows=last-first;
  const half=1<<(PRECISION_BITS-1), temp=new Uint8ClampedArray(outWidth*rows*4);
  for (let y=0;y<rows;y++) for (let x=0;x<outWidth;x++) {
    const min=horizontal.bounds[x*2], count=horizontal.bounds[x*2+1], k=x*horizontal.size;
    let r=half,g=half,b=half;
    for (let i=0;i<count;i++) {
      const source=((y+first)*width+min+i)*4, weight=horizontal.weights[k+i];
      r+=rgba[source]*weight;g+=rgba[source+1]*weight;b+=rgba[source+2]*weight;
    }
    const target=(y*outWidth+x)*4;temp[target]=clip8(r);temp[target+1]=clip8(g);temp[target+2]=clip8(b);
  }
  const output=new Uint8ClampedArray(outWidth*outHeight*4);
  for (let y=0;y<outHeight;y++) {
    const min=vertical.bounds[y*2]-first, count=vertical.bounds[y*2+1], k=y*vertical.size;
    for (let x=0;x<outWidth;x++) {
      let r=half,g=half,b=half;
      for (let i=0;i<count;i++) {
        const source=((min+i)*outWidth+x)*4, weight=vertical.weights[k+i];
        r+=temp[source]*weight;g+=temp[source+1]*weight;b+=temp[source+2]*weight;
      }
      const target=(y*outWidth+x)*4;output[target]=clip8(r);output[target+1]=clip8(g);output[target+2]=clip8(b);output[target+3]=255;
    }
  }
  return output;
}

export class WasmDetector {
  constructor(cv, manifest, buffers, loadArt) {
    for (const key of ['Mat','SIFT','KeyPointVector','createBoxLensFlannMatcher','boxLensFlannKnnMatch',
      'estimateAffine2D','warpAffine','invertAffineTransform','resize','cvtColor']) if (!cv[key]) throw new Error('missingWasmBinding:'+key);
    if (manifest.format !== 'ournotes.browser-feature-gallery/2') throw new Error('invalidGalleryFormat');
    const identities=new Set();
    for (const card of manifest.cards) {
      canonicalId(card.id);
      if (!['member','snap'].includes(card.kind) || !Number.isSafeInteger(card.width) || card.width<1 ||
          !Number.isSafeInteger(card.height) || card.height<1) throw new Error('invalidGalleryCard');
      artworkRecord(card);
      const key=card.kind+':'+card.id;
      if (identities.has(key)) throw new Error('duplicateGalleryId'); identities.add(key);
    }
    const rows=manifest.buffers.descriptors.shape[0];
    const descriptors=new Float32Array(buffers.descriptors), points=new Float32Array(buffers.points), owners=new Int32Array(buffers.owners);
    if (descriptors.length!==rows*128 || points.length!==rows*2 || owners.length!==rows ||
        owners.some(owner=>owner<0 || owner>=manifest.cards.length) ||
        descriptors.some(value=>!Number.isFinite(value)) || points.some(value=>!Number.isFinite(value))) throw new Error('invalidGalleryBuffers');
    this.cv=cv; this.manifest=manifest; this.points=points; this.owners=owners; this.loadArt=loadArt;
    this.art=new Map(); this.gallery=own(cv.matFromArray(rows,128,cv.CV_32F,descriptors));
    cv.setRNGSeed(12345);
    this.matcher=own(cv.createBoxLensFlannMatcher(4,64));
    const training=own(new cv.MatVector());
    try { training.push_back(this.gallery); this.matcher.add(training); this.matcher.train(); }
    catch (error) { this.matcher.delete(); this.gallery.delete(); throw error; }
    finally { training.delete(); }
    this.sift=own(new cv.SIFT(8000,3,.018,12,1.6,cv.CV_32F,false));
  }

  async recognize(image, control) {
    const cv=this.cv, w=image.cols, h=image.rows, factor=Math.min(1,1500/Math.max(w,h));
    const resources=[], retain=value=>{resources.push(own(value));return value;};
    const checkpoint=async phase=>{control.check(phase);await new Promise(resolve=>setTimeout(resolve,0));control.check(phase);};
    const diagnostics={keypoints:0,ratioOwners:{},rejected:[],phases:[]};
    try {
      await checkpoint('preprocess');
      const small=retain(new cv.Mat()), gray=retain(new cv.Mat());
      if (factor<1) cv.resize(image,small,new cv.Size(0,0),factor,factor,cv.INTER_LINEAR);
      else image.copyTo(small);
      cv.cvtColor(small,gray,cv.COLOR_BGR2GRAY);
      const points=retain(new cv.KeyPointVector()), desc=retain(new cv.Mat()), mask=retain(new cv.Mat());
      await checkpoint('sift');
      this.sift.detectAndCompute(gray,mask,points,desc,false);
      diagnostics.keypoints=points.size();
      await checkpoint('siftReturned');
      if (!desc.rows) return {cards:[],diagnostics};
      if (desc.cols!==128 || desc.type()!==cv.CV_32F) throw new Error('invalidSiftShape');
      const queries=retain(cv.matFromArray(desc.rows,128,cv.CV_32F,rootSift(desc.data32F,desc.rows)));
      const matches=retain(cv.boxLensFlannKnnMatch(this.matcher,queries,2)), grouped=new Map();
      for (let i=0;i<matches.size();i++) {
        const row=matches.get(i);
        try {
          if (row.size()!==2) continue;
          const first=row.get(0), second=row.get(1);
          if (first.distance < .76*second.distance) {
            const owner=this.owners[first.trainIdx];
            if (!grouped.has(owner)) grouped.set(owner,[]);
            grouped.get(owner).push([first.trainIdx,first.queryIdx,first.distance]);
          }
        } finally { row.delete(); }
      }
      diagnostics.ratioOwners=Object.fromEntries([...grouped].map(([owner,pairs])=>[String(owner),pairs.length]));
      const found=[];
      for (const [index,pairs] of grouped) {
        await checkpoint('candidate:'+index);
        const card=this.manifest.cards[index], objects=[];
        const take=value=>{objects.push(own(value));return value;};
        const reject=reason=>diagnostics.rejected.push({kind:card.kind,id:card.id,reason,pairs:pairs.length});
        try {
          if (pairs.length<5) {reject('fewCorrespondences');continue;}
          const src=[],dst=[];
          for (const [train,query] of pairs) {
            src.push(this.points[train*2],this.points[train*2+1]);
            const point=points.get(query).pt;
            // Keep the original float32 division before the affine estimator.
            dst.push(Math.fround(point.x/Math.fround(factor)),Math.fround(point.y/Math.fround(factor)));
          }
          const source=take(cv.matFromArray(pairs.length,1,cv.CV_32FC2,src));
          const target=take(cv.matFromArray(pairs.length,1,cv.CV_32FC2,dst)), inliers=take(new cv.Mat());
          const transform=take(cv.estimateAffine2D(source,target,inliers,cv.RANSAC,2.5/factor,1500,.99,10));
          const count=Array.from(inliers.data).reduce((a,b)=>a+b,0), t=Array.from(transform.data64F);
          if (t.length!==6 || t.some(v=>!Number.isFinite(v)) || count<5) {reject('fewAffineInliers');continue;}
          const sx=Math.hypot(t[0],t[3]),sy=Math.hypot(t[1],t[4]),angle=Math.atan2(t[3],t[0])*180/Math.PI;
          if (!(sy>0) || Math.abs(angle)>4 || Math.abs(t[1])>.08*sy || !(.55<sx/sy && sx/sy<1.8) ||
              !(55<card.width*sx && card.width*sx<w*.9)) {reject('geometry');continue;}
          const x=t[2],y=t[5],bw=card.width*sx,bh=card.height*sy;
          if (x+bw<0 || y+bh<0 || x>w || y>h) {reject('outsideImage');continue;}
          if (!this.art.has(index)) this.art.set(index,own(await this.loadArt(card)));
          await checkpoint('artVerification:'+index);
          const recovered=take(new cv.Mat()), inverse=take(new cv.Mat());
          cv.invertAffineTransform(transform,inverse);
          cv.warpAffine(image,recovered,inverse,new cv.Size(card.width,card.height),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar());
          const a=take(new cv.Mat()),b=take(new cv.Mat()), height=card.kind==='member'?64:27;
          cv.resize(this.art.get(index),a,new cv.Size(48,height),0,0,cv.INTER_LINEAR);
          cv.resize(recovered,b,new cv.Size(48,height),0,0,cv.INTER_LINEAR);
          let pixels=0,n=0,aa=0,bb=0,ab=0,a2=0,b2=0;
          for (let yy=0;yy<height;yy++) for (let xx=0;xx<48;xx++) {
            const start=(yy*48+xx)*3;
            if (yy>=Math.floor(height*.8) || (yy<Math.max(1,Math.floor(height*.1)) && xx<8) ||
                Math.max(b.data[start],b.data[start+1],b.data[start+2])===0) continue;
            pixels++;
            for (let channel=0;channel<3;channel++) {
              const av=a.data[start+channel],bv=b.data[start+channel];
              n++;aa+=av;bb+=bv;ab+=av*bv;a2+=av*av;b2+=bv*bv;
            }
          }
          if (pixels<150) {reject('fewVisibleArtworkPixels');continue;}
          const similarity=(ab-aa*bb/n)/Math.sqrt((a2-aa*aa/n)*(b2-bb*bb/n));
          if (!Number.isFinite(similarity) || similarity<.68) {reject('artworkCorrelation');continue;}
          const visible=Math.max(0,Math.min(w,x+bw)-Math.max(0,x))*Math.max(0,Math.min(h,y+bh)-Math.max(0,y))/(bw*bh);
          const box=[x,y,bw,bh].map(v=>round(v,2));
          const inner=uiBox(card,box).map(v=>round(v,2));
          found.push({kind:card.kind,id:card.id,bbox:box,uiBBox:inner,frameBBox:frameBox(card.kind,inner).map(v=>round(v,2)),
            identityConfidence:round(similarity,4),inliers:count,visibleFraction:round(visible,4),
            affine:t,identityMethod:'siftFlannWasm',review:true});
        } finally { objects.reverse().forEach(object=>object.delete()); }
      }
      await checkpoint('nms');
      const accepted=[];
      for (const item of found.sort((a,b)=>b.identityConfidence-a.identityConfidence || b.inliers-a.inliers)) {
        if (!accepted.some(other=>overlap(item.bbox,other.bbox)>.5)) accepted.push(item);
      }
      accepted.sort((a,b)=>Math.round(a.bbox[1]/20)-Math.round(b.bbox[1]/20) || a.bbox[0]-b.bbox[0]);
      return {cards:accepted,diagnostics};
    } finally { resources.reverse().forEach(object=>object.delete()); }
  }

  delete() {
    for (const art of this.art.values()) art.delete();this.art.clear();
    this.sift.delete();this.matcher.delete();this.gallery.delete();
  }
}
