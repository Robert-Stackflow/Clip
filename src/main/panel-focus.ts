/** Ignore opening/child-popup focus transitions, but dismiss after a real departure. */
export class PanelFocusGuard{
 private acquired=false;private outsidePress=false;private lostAt?:number;private pressed=false;
 constructor(private openedAt:number,pressed=false){this.pressed=pressed;}
 focus(){this.acquired=true;this.lostAt=undefined;}
 check(now:number,focused:boolean,inside:boolean,pressed:boolean,busy:boolean){
  if(pressed&&!this.pressed&&!inside)this.outsidePress=true;this.pressed=pressed;
  // An explicit outside click takes priority over activation and startup grace.
  // Finish any in-flight paste before invalidating its captured target.
  if(this.outsidePress)return !busy;
  if(focused){if(now-this.openedAt>=800)this.focus();else this.lostAt=undefined;this.outsidePress=false;return false;}
  if(busy||inside||now-this.openedAt<800){this.lostAt=undefined;return false;}
  // If Windows refused initial activation, keep the panel usable until an
  // explicit outside click instead of closing it before its first interaction.
  if(!this.acquired&&!this.outsidePress)return false;
  this.lostAt??=now;return now-this.lostAt>=300;
 }
}
