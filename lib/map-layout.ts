// Keep fitted points inside the visible map, clear of the list and detail panels.
export function mapInsets(width:number,height:number,details=false){
  if(width<=760)return{paddingTopLeft:[25,100],paddingBottomRight:[25,details?Math.min(height*.48,420)+40:110]};
  return{paddingTopLeft:[details&&width<=1200?32:408,40],paddingBottomRight:[details?480:55,45]};
}
