const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const html=path.join(__dirname,'dist/preview.html');
const port=Number(process.env.POCKET_PREVIEW_PORT)||17866;
http.createServer(async(req,res)=>{try{
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(html))}
  if(/^\/api\/(status|playlists|tracks|resolve|qr|logout|daily|roam|liked|queue-page|queue-pin)(\?|$)/.test(req.url)){
    let body='';for await(const c of req)body+=c;
    const r=await fetch('http://127.0.0.1:17863'+req.url,{method:req.method,headers:{'X-Local-Probe':'1','Content-Type':'application/json'},...(body?{body}:{})});res.writeHead(r.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await r.text())
  }res.writeHead(404);res.end();
}catch(e){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'预览服务暂不可用'}))}}).listen(port,'127.0.0.1',()=>console.log('Private 3D review: http://127.0.0.1:'+port));
