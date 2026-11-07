// Small, crisp UI sprites drawn on a 24px grid. No uploaded profile data.
const r=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const svg=(body,size,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
const looks=[['#d8a16e','#382d2a','#82bb94'],['#e9b98b','#6b4437','#dba65c'],['#b98663','#222b38','#7bb5c9'],['#edc29a','#966343','#c886a2'],['#ba8e6c','#ddd7b2','#7d9bcd'],['#c6967f','#24273b','#b4a0db'],['#d4b387','#824e32','#adb968'],['#a87052','#242633','#d89166'],['#e2bb91','#504336','#75b4a6'],['#b2c2bd','#718c87','#c6b061'],['#d4a17c','#4c465f','#9e8cc5'],['#c1a36e','#1a3535','#b0cb8c']];
export function pixelPortrait(id,size=40){
 const i=Math.max(0,Number(String(id).replace('g',''))||0)%12,[skin,hair,shirt]=looks[i],outline='#111d2a';
 let b=r(0,0,24,24,'#111b27')+r(1,1,22,22,'#53636a')+r(2,2,20,20,'#25353c')+r(3,3,18,2,'#34494c')+r(5,18,14,5,outline)+r(6,18,12,5,shirt)+r(9,16,6,4,skin)+r(6,6,12,10,outline)+r(7,7,10,9,skin)+r(5,10,2,4,skin)+r(17,10,2,4,skin)+r(7,5,10,4,hair)+r(6,7,2,4,hair)+r(16,7,2,4,hair)+r(8,9,3,1,hair)+r(14,9,2,1,hair)+r(9,11,1,2,outline)+r(15,11,1,2,outline)+r(10,15,4,1,'#8b594c')+r(8,10,1,1,'#f5ddbc')+r(7,20,2,3,'#f0e1b777')+r(15,20,3,3,'#111b2744');
 if(i===0||i===7)b+=r(6,5,12,3,shirt)+r(12,8,8,2,shirt)+r(8,5,2,2,'#d8e6b7');
 if(i===1||i===6)b+=r(6,5,12,3,'#989d94')+r(6,8,2,8,'#747f7e')+r(16,8,2,8,'#747f7e')+r(11,4,2,5,'#d8ccb0');
 if(i===2)b+=r(7,10,10,4,'#193d46')+r(8,11,3,1,'#a9e0d3')+r(14,11,2,1,'#a9e0d3');
 if(i===4||i===10)b+=r(5,7,14,2,shirt)+r(8,4,8,3,shirt)+r(11,2,3,2,shirt)+r(12,5,2,2,'#edcc77');
 if(i===5)b+=r(7,13,10,4,hair)+r(6,8,12,2,shirt)+r(17,9,4,2,shirt);
 if(i===8)b+=r(5,9,2,7,shirt)+r(17,9,2,7,shirt)+r(7,6,10,2,shirt);
 if(i===9)b+=r(7,8,10,8,skin)+r(8,10,3,2,'#8ad6c5')+r(14,10,2,2,'#8ad6c5')+r(9,14,6,1,outline)+r(11,3,2,3,skin)+r(11,2,2,2,'#ddbc73');
 if(i===11)b+=r(6,6,12,4,shirt)+r(4,5,4,4,shirt)+r(16,5,4,4,shirt)+r(7,4,2,2,shirt)+r(15,4,2,2,shirt);
 return svg(b,size,'pp-av');
}
export function pixelBadge(id,size=48){
 const gold='#e3bc65',light='#ffdf96',dark='#927541',mint='#a9d3a2',ink='#162635';let b='';
 const type=['first','five','ten','explorer','cats','hour','regular','marathon','streak3','streak7','daily1','daily7','fav','level5','level10'].indexOf(id);
 if([0,1,2,13,14].includes(type)){b=r(5,4,14,3,dark)+r(6,5,12,8,gold)+r(8,12,8,3,gold)+r(10,15,4,4,dark)+r(7,19,10,3,gold)+r(3,7,3,5,gold)+r(18,7,3,5,gold)+r(4,11,4,3,dark)+r(16,11,4,3,dark)+r(8,6,2,5,light);if(type>0)b+=r(11,7,2,5,ink)+r(10,8,4,2,ink);}
 else if(type===3||type===4){b=r(10,2,4,3,light)+r(7,5,10,9,gold)+r(4,12,3,7,mint)+r(17,12,3,7,mint)+r(9,14,6,4,dark)+r(10,18,4,4,'#dd8758')+r(10,7,4,4,ink)+r(11,8,2,2,'#9fd6d3');}
 else if(type===5||type===6||type===7){b=r(6,3,12,2,dark)+r(3,6,18,12,dark)+r(6,19,12,2,dark)+r(5,5,14,14,gold)+r(7,7,10,10,'#e4dab0')+r(11,7,2,6,ink)+r(13,11,4,2,ink)+r(9,1,6,2,gold);}
 else if(type===8||type===9){b=r(11,2,3,5,light)+r(9,7,8,5,gold)+r(6,10,12,7,'#dc854e')+r(8,17,9,3,dark)+r(10,11,4,7,light)+r(5,7,3,8,gold);}
 else if(type===12){b=r(3,5,7,7,'#d8788a')+r(14,5,7,7,'#d8788a')+r(5,10,14,5,'#d8788a')+r(8,15,8,3,'#d8788a')+r(11,18,3,3,'#d8788a')+r(5,7,3,2,'#f6b2ad');}
 else{b=r(5,3,14,17,dark)+r(6,4,12,14,gold)+r(8,7,8,2,ink)+r(8,11,6,2,ink)+r(8,15,4,2,ink)+r(15,17,5,3,mint)+r(18,14,3,4,mint);}
 return svg(b,size,'pixel-badge');
}
