export const photoLooks = [
  {id:'natural',name:'Natural',description:'True-to-life colour. Your everyday default.',matrix:[1,0,0,0,0,1,0,0,0,0,1,0]},
  {id:'vivid',name:'Vivid',description:'Richer colour and crisp contrast for a lively party.',matrix:[1.18,-.07,-.03,-.025,-.03,1.12,-.01,-.025,-.03,-.07,1.18,-.025]},
  {id:'golden',name:'Golden',description:'A gentle warm glow for candlelight and golden hour.',matrix:[1.05,.015,0,.018,0,1.01,0,.008,0,.015,.94,.005]},
  {id:'soft',name:'Soft',description:'Airy colour and gentler contrast for portraits.',matrix:[.92,.025,.015,.035,.02,.92,.02,.035,.015,.025,.92,.04]},
  {id:'vintage',name:'Vintage',description:'Faded shadows and warm, muted colour. No fake grain.',matrix:[.91,.07,.02,.035,.03,.88,.04,.025,.025,.08,.80,.045]},
  {id:'mono',name:'Mono',description:'Timeless black-and-white with a little contrast.',matrix:[.23,.775,.078,-.035,.23,.775,.078,-.035,.23,.775,.078,-.035]}
];
export function lookMatrix(id,strength=70){
  const target=photoLooks.find(l=>l.id===id);if(!target)throw new Error('Unknown photo look');
  const amount=Math.max(0,Math.min(100,Number(strength)))/100,identity=photoLooks[0].matrix;
  return target.matrix.map((v,i)=>identity[i]+(v-identity[i])*amount);
}
export function svgLookMatrix(id,strength){const m=lookMatrix(id,strength);return [m[0],m[1],m[2],0,m[3],m[4],m[5],m[6],0,m[7],m[8],m[9],m[10],0,m[11],0,0,0,1,0].join(' ');}
export function applyPhotoLook(pixels,id,strength,channels=3){
  const m=lookMatrix(id,strength);if(id==='natural'||strength===0)return pixels;
  for(let i=0;i<pixels.length;i+=channels){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];pixels[i]=Math.max(0,Math.min(255,Math.round(r*m[0]+g*m[1]+b*m[2]+255*m[3])));pixels[i+1]=Math.max(0,Math.min(255,Math.round(r*m[4]+g*m[5]+b*m[6]+255*m[7])));pixels[i+2]=Math.max(0,Math.min(255,Math.round(r*m[8]+g*m[9]+b*m[10]+255*m[11])));}
  return pixels;
}
