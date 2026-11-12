import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const guardians=fs.readFileSync(new URL('../guardioes.html',import.meta.url),'utf8');
const rgb=hex=>{
 const full=hex.length===4?'#'+[...hex.slice(1)].map(x=>x+x).join(''):hex;
 return [1,3,5].map(offset=>parseInt(full.slice(offset,offset+2),16)/255);
};
const luminance=color=>color.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((total,x,i)=>total+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const [low,high]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (high+.05)/(low+.05)};
const brighten=(color,amount)=>color.map(x=>Math.min(1,x*amount));
test('primary button text clears 4.5:1 across the gradient, including hover and focus',()=>{
 const colors=index.match(/background:linear-gradient\(135deg,(#[a-f0-9]+),(#[a-f0-9]+)\);color:(#[a-f0-9]+)/i);assert.ok(colors);
 const from=rgb(colors[1]),to=rgb(colors[2]),foreground=rgb(colors[3]);
 const hover=Number(index.match(/button:hover\{filter:brightness\(([0-9.]+)\)/)[1]);
 for(const amount of [1,hover])for(let i=0;i<=100;i++){
  const background=from.map((v,c)=>v+(to[c]-v)*i/100);
  assert.ok(contrast(brighten(foreground,amount),brighten(background,amount))>=4.5);
 }
 assert.match(index,/button:focus-visible\{outline:3px solid #775222;outline-offset:3px\}/);
 const guardianPrimary=guardians.match(/button\{[^}]*background:(#[a-f0-9]+);color:(#[a-f0-9]+)/i);assert.ok(guardianPrimary);
 assert.ok(contrast(rgb(guardianPrimary[1]),rgb(guardianPrimary[2]))>=4.5);
 assert.match(guardians,/button:focus-visible\{outline:3px solid #775222;outline-offset:3px\}/);
});
test('primary disabled button text stays readable without inherited opacity',()=>{
 for(const html of [index,guardians]){
  const style=html.match(/button:not\(\.secondary\):not\(\.danger\)(?:\:not\(\.password-toggle\):not\(\.inline\))?:disabled\{opacity:1;background:(#[a-f0-9]+);color:(#[a-f0-9]+)\}/i);assert.ok(style);
  for(const amount of [1,1.05])assert.ok(contrast(brighten(rgb(style[1]),amount),brighten(rgb(style[2]),amount))>=4.5);
 }
});

test('WhatsApp call to action and muted copy clear 4.5:1 on their light card backgrounds',()=>{
 const action=index.match(/background:(#[a-f0-9]+);color:white;text-decoration:none/);assert.ok(action);assert.ok(contrast(rgb(action[1]),rgb('#fff'))>=4.5);
 const muted=index.match(/\.muted\{color:(#[a-f0-9]+);/);assert.ok(muted);
 for(const background of ['#fffefb','#fffaf2','#faf8f3'])assert.ok(contrast(rgb(muted[1]),rgb(background))>=4.5);
});
