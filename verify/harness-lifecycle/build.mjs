const candidate=process.env.CANDIDATE_DIR; if(!candidate) throw new Error('Set CANDIDATE_DIR');
const {build}=await import(candidate+'/apps/explorer/node_modules/vite/dist/node/index.js');
import fs from 'node:fs';
const root=process.env.HARNESS_DIR || new URL('.',import.meta.url).pathname;
await build({configFile:false,root,resolve:{alias:[{find:/^#comps\/(.*)/,replacement:candidate+'/apps/explorer/src/comps/$1'},{find:/^#lib\/(.*)/,replacement:candidate+'/apps/explorer/src/lib/$1'}]},esbuild:{jsx:'automatic'},build:{outDir:'dist',rollupOptions:{input:root+'/client.tsx',output:{entryFileNames:'client.js'}}}});
const response=await fetch(`http://127.0.0.1:${process.env.HARNESS_PORT || 3012}/`);let html=await response.text();html=html.replace(/<script type="module" src="\/@vite\/client"><\/script>/,'').replace('src="/client.tsx"','src="/client.js"');fs.writeFileSync(root+'/dist/index.html',html);
