const candidate=process.env.CANDIDATE_DIR; if(!candidate) throw new Error('Set CANDIDATE_DIR');
const {createServer}=await import(candidate+'/apps/explorer/node_modules/vite/dist/node/index.js');
import http from 'node:http';
const root=process.env.HARNESS_DIR || new URL('.',import.meta.url).pathname;
const vite=await createServer({configFile:false,root,server:{middlewareMode:true,hmr:{port:Number(process.env.HARNESS_PORT || 3012)+100},fs:{allow:[candidate,root]}},resolve:{alias:[{find:/^#comps\/(.*)/,replacement:candidate+'/apps/explorer/src/comps/$1'},{find:/^#lib\/(.*)/,replacement:candidate+'/apps/explorer/src/lib/$1'}]},esbuild:{jsx:'automatic'}});
http.createServer(async (req,res)=>{
 if(req.url==='/'||req.url.startsWith('/?')){
  try {const {render}=await vite.ssrLoadModule('/ssr.tsx');const html=render(); res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,`<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="root">${html}</div><script type="module" src="/client.tsx"></script></body></html>`));}catch(e){res.statusCode=500;res.end(e.stack);}
 } else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
}).listen(Number(process.env.HARNESS_PORT || 3012),'127.0.0.1',()=>console.log('Independent candidate React harness http://127.0.0.1:3012'));
