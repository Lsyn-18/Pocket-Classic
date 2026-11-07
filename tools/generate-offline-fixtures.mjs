// Original synthetic silence and a standard NCM container; no copyrighted music.
import fs from 'node:fs';
import path from 'node:path';
import {createCipheriv,createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const pcm=Buffer.alloc(8000*12,128),wav=Buffer.alloc(44+pcm.length);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(8000,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
const key=Buffer.from('Pocket Classic synthetic stream key'),core=Buffer.from('687a4852416d736f356b496e62617857','hex'),metaKey=Buffer.from('2331346c6a6b5f215c5d2630553c2728','hex');
const encrypt=(data,key)=>{const c=createCipheriv('aes-128-ecb',key,null);return Buffer.concat([c.update(data),c.final()]);};
const xor=(buffer,value)=>Buffer.from(buffer.map(b=>b^value));
const length=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const streamKey=xor(encrypt(Buffer.concat([Buffer.from('neteasecloudmusic'),key]),core),0x64);
const metadata={musicName:'Pocket Classic 离线测试',artist:[['测试音频',0]],album:'合成静音，不含真实音乐',duration:12000,format:'wav'};
const meta=xor(Buffer.from("163 key(Don't modify):"+encrypt(Buffer.from('music:'+JSON.stringify(metadata)),metaKey).toString('base64')),0x63);
const box=Array.from({length:256},(_,i)=>i);let last=0;
for(let i=0;i<256;i++){const next=(box[i]+last+key[i%key.length])&255;[box[i],box[next]]=[box[next],box[i]];last=next;}
const audio=Buffer.from(wav);for(let i=0;i<audio.length;i++){const j=(i+1)&255;audio[i]^=box[(box[j]+box[(box[j]+j)&255])&255];}
const ncm=Buffer.concat([Buffer.from('CTENFDAM'),Buffer.alloc(2),length(streamKey.length),streamKey,length(meta.length),meta,Buffer.alloc(5),length(37),length(3),Buffer.from([1,2,3]),Buffer.alloc(34),audio]);
for(const sub of ['src/test/resources','src/androidTest/assets']){const dir=path.join(root,'android-player/app',sub);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'offline-silence.wav'),wav);fs.writeFileSync(path.join(dir,'offline-silence.ncm'),ncm);}
console.log(JSON.stringify({wavBytes:wav.length,ncmBytes:ncm.length,wavSha256:createHash('sha256').update(wav).digest('hex')}));
