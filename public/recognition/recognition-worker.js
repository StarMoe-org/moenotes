// Classic Worker. Remote code (OpenCV and ONNX Runtime glue) runs only after its SHA-256 matches the bundle;
// the field reader modules are this site's own files next to the Worker.
let latest=null, queue=Promise.resolve(), detector=null, configurationKey=null, cvReady=null;
const clock=()=>performance.timeOrigin+performance.now();
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':
  value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);

// Bundle files are content-addressed (`<sha256>.<ext>`); a cached copy is used only if its bytes still match.
async function checkedFetch(url,expected,context,bytes) {
  context.check('assetFetch');
  const response=await fetch(url,{signal:context.abort.signal,credentials:'omit'});
  if (!response.ok) throw new Error('assetHttp:'+response.status);
  const body=await response.arrayBuffer();
  if (bytes!==undefined && body.byteLength!==bytes) throw new Error('assetLengthMismatch');
  if (await sha(body)!==expected) throw new Error('assetHashMismatch');
  context.check('assetVerified');return body;
}

// Files named by a manifest are siblings of that manifest: `<sha256>.<ext>`, the SHA-256 the record carries.
function siblingResolver(manifestUrl) {
  const base=new URL('.',manifestUrl);
  return record=>{
    const file=record?.file;
    if (typeof file!=='string' || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(file) || file.slice(0,64)!==record.sha256) throw new Error('invalidAssetPath');
    return new URL(file,base).href;
  };
}

async function initialize(configuration,context,core) {
  const key=configuration.manifestUrl+'#'+configuration.manifestSha256;
  if (detector && configurationKey===key) return detector;
  const raw=await checkedFetch(configuration.manifestUrl,configuration.manifestSha256,context);
  const manifest=JSON.parse(new TextDecoder().decode(raw));
  if (manifest.galleryId!==context.binding.galleryId) throw new Error('galleryBindingMismatch');
  const claimed=manifest.galleryId, content={...manifest};delete content.galleryId;
  if (await sha(new TextEncoder().encode(canonical(content)))!==claimed) throw new Error('galleryIdentityMismatch');
  const resolve=siblingResolver(configuration.manifestUrl);
  const buffers={};
  for (const name of ['descriptors','points','owners']) {
    const record=manifest.buffers[name];
    buffers[name]=await checkedFetch(resolve(record),record.sha256,context,record.bytes);
  }
  if (!cvReady) {
    const glue=await checkedFetch(resolve(manifest.opencv.glue),manifest.opencv.glue.sha256,context,manifest.opencv.glue.bytes);
    const wasm=await checkedFetch(resolve(manifest.opencv.wasm),manifest.opencv.wasm.sha256,context,manifest.opencv.wasm.bytes);
    self.Module={wasmBinary:new Uint8Array(wasm),locateFile:()=>resolve(manifest.opencv.wasm)};
    const url=URL.createObjectURL(new Blob([glue],{type:'application/javascript'}));
    try { importScripts(url); }
    finally { URL.revokeObjectURL(url); }
    const candidate=self.cv;
    cvReady=(candidate&&typeof candidate.then==='function')?
      new Promise((resolve,reject)=>candidate.then(value=>resolve({cv:value}),reject)):
      Promise.resolve({cv:candidate});
  }
  const cv=(await cvReady).cv;context.check('opencvReady');
  if (detector) detector.delete();
  detector=new core.WasmDetector(cv,manifest,buffers,null);configurationKey=key;detector.resolve=resolve;
  return detector;
}

// Card artwork is a bundle file next to the gallery manifest. The bytes must match
// the gallery record before decoding; Member squares are then cropped and
// resampled to the card size, Snap images are used as decoded.
async function loadArtwork(card,resolve,context,cv,core) {
  const art=core.artworkRecord(card);
  const bytes=await checkedFetch(resolve(art),art.sha256,context,art.bytes);
  const bitmap=await createImageBitmap(new Blob([bytes]),{colorSpaceConversion:'none'});
  try {
    if (bitmap.width!==art.width || bitmap.height!==art.height) throw new Error('artworkShapeMismatch');
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height), draw=canvas.getContext('2d',{willReadFrequently:true});
    draw.drawImage(bitmap,0,0);
    const decoded=draw.getImageData(0,0,bitmap.width,bitmap.height).data;
    const pixels=art.derive.method==='fit'?core.fitArtwork(decoded,art.width,art.height,art.derive.box,card.width,card.height):decoded;
    const rgba=cv.matFromArray(card.height,card.width,cv.CV_8UC4,pixels), bgr=new cv.Mat();
    try {cv.cvtColor(rgba,bgr,cv.COLOR_RGBA2BGR);return bgr;}
    catch(error){bgr.delete();throw error;}
    finally {rgba.delete();}
  } finally {bitmap.close();}
}

async function readVisibleFields(configuration,context,image,cards,cv) {
  if (!configuration.fieldManifestUrl) return null;
  if (typeof configuration.fieldManifestSha256!=='string') throw new Error('invalidFieldManifest');
  const raw=await checkedFetch(configuration.fieldManifestUrl,configuration.fieldManifestSha256,context);
  const manifest=JSON.parse(new TextDecoder().decode(raw));
  if (manifest.format!=='ournotes.browser-cultivation-assets/2') throw new Error('invalidFieldManifestFormat');
  const sibling=siblingResolver(configuration.fieldManifestUrl),resolve=record=>({...record,url:sibling(record)});
  if (!self.boxLensLoadFieldRuntime || !self.boxLensReadFields)
    importScripts(new URL('./field-runtime-loader.js',self.location.href).href,new URL('./field-reader.js',self.location.href).href);
  const control={check:context.check,signal:context.abort.signal};
  const runtime=await self.boxLensLoadFieldRuntime({runtime:Object.fromEntries(Object.entries(manifest.runtime).map(([key,record])=>[key,resolve(record)]))},control);
  const fields=await self.boxLensReadFields({cv,image,items:cards.map(card=>({...card,bbox:card.uiBBox})),
    control,ort:runtime.ort,config:{...runtime,model:resolve(manifest.model)}});
  if (!Array.isArray(fields) || fields.length!==cards.length) throw new Error('fieldOutputShapeMismatch');
  context.check('visibleFieldsReturned');return fields;
}

self.onmessage=event=>{
  const request=event.data;
  if (request?.type==='cancel') {
    if (latest && ['jobId','inputRevision','datasetId','galleryId'].every(key=>latest.binding[key]===request.binding?.[key])) {
      latest.cancelled=true;latest.abort.abort();
    }
    return;
  }
  if (request?.type!=='recognize') return;
  if (latest) {latest.stale=true;latest.abort.abort();}
  const context={binding:request.binding,abort:new AbortController(),started:clock(),cancelled:false,stale:false};
  latest=context;
  queue=queue.catch(()=>{}).then(async()=>{
    let image=null;
    try {
      const core=await import('./detector-core.mjs');
      context.binding=core.binding(request.binding);
      const limit=request.budget?.timeLimitMs, declared=request.budget?.deadlineEpochMs;
      if (!Number.isFinite(limit) || limit<0 || limit>120000 || !Number.isFinite(declared)) throw new Error('invalidBudget');
      context.deadline=Math.min(declared,context.started+limit);
      context.check=phase=>{
        if (context.cancelled) throw new Error('cancelled');
        if (context.stale || latest!==context) throw new Error('stale');
        if (clock()>=context.deadline) throw new Error('timeLimit');
        self.postMessage({type:'progress',binding:context.binding,phase,elapsedMs:clock()-context.started});
      };
      context.check('start');
      const {width,height,rgba,sourceId}=request.image??{};
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width<1 || height<1 || width*height>24000000 ||
          !(rgba instanceof ArrayBuffer) || rgba.byteLength!==width*height*4 || typeof sourceId!=='string') throw new Error('invalidImage');
      const engine=await initialize(request.configuration,context,core);
      if (engine.manifest.galleryId!==context.binding.galleryId) throw new Error('galleryBindingMismatch');
      const cv=engine.cv, input=cv.matFromArray(height,width,cv.CV_8UC4,new Uint8Array(rgba));
      image=new cv.Mat();
      try {cv.cvtColor(input,image,cv.COLOR_RGBA2BGR);} finally {input.delete();}
      // Cached artwork loads use the current context; never a prior job's cancelled controller.
      engine.loadArt=card=>loadArtwork(card,engine.resolve,context,cv,core);
      const output=await engine.recognize(image,context);
      const fields=await readVisibleFields(request.configuration,context,image,output.cards,cv);
      const decodedPixelSha256=await sha(rgba);context.check('publish');
      const unknown=()=>({value:null,confidence:0,reason:'notObserved'});
      self.postMessage({type:'result',binding:context.binding,status:'complete',...output,
        cards:output.cards.map((card,index)=>({...card,level:fields?.[index].level??unknown(),card_rank:unknown(),awake_count:fields?.[index].awake_count??unknown(),
          ...(fields?.[index].display_mode?{display_mode:fields[index].display_mode}:{}),...(fields?.[index].crop_bbox?{crop_bbox:fields[index].crop_bbox}:{}),
          ...(fields?.[index].recognition_method?{recognition_method:fields[index].recognition_method}:{})})),
        sourceId,decodedPixelSha256,elapsedMs:clock()-context.started,
        scope:{coverage:'observed_only',sourceRegionVerified:false,catalog:engine.manifest.catalog.map(({region,masterVersion})=>({region,masterVersion})),
          galleryId:engine.manifest.galleryId,source:engine.manifest.source,
          genuineOpenCvWasm:true,identityGeometryOnly:fields===null,cultivationObserved:fields!==null,
          ...(fields?{fieldManifestSha256:request.configuration.fieldManifestSha256}:{}),fullScanCertified:false}});
    } catch(error) {
      const reason=context.cancelled?'cancelled':context.stale||latest!==context?'stale':clock()>=context.deadline?'timeLimit':String(error.message??error);
      const status=['cancelled','stale','timeLimit'].includes(reason)?reason:'failed';
      self.postMessage({type:'result',binding:context.binding,status,cards:[],sourceId:request.image?.sourceId,
        elapsedMs:clock()-context.started,error:reason});
    } finally {image?.delete();}
  });
};
