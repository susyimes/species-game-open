export const ECOLOGY_TIMING=Object.freeze({requestMs:50000,pollMs:55000,acceptTicks:2300});

const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(k=>keys.includes(k));
export function validateChoices(raw,observation) {
  if(!exact(raw,['schema_version','choices'])||raw.schema_version!==1||!Array.isArray(raw.choices)||raw.choices.length>6)throw new Error('invalid_envelope');
  const opportunities=new Map(observation.opportunities.map(o=>[o.id,o])),accepted=[],rejected=[];
  const ids=raw.choices.map(c=>c?.opportunity_id);
  for(const c of raw.choices){
    let reason=null;
    const op=opportunities.get(c?.opportunity_id);
    if(!exact(c,['role','opportunity_id','action_id','variant_id','basis_ids','reason'])||!op)reason='unknown_opportunity';
    else if(ids.filter(id=>id===c.opportunity_id).length!==1)reason='duplicate_opportunity';
    else if(c.role!==op.role||!op.allowed_choices.some(a=>a.action_id===c.action_id&&a.variant_id===c.variant_id))reason='invalid_action';
    else if(!Array.isArray(c.basis_ids)||c.basis_ids.length<1||c.basis_ids.length>4||c.basis_ids.some(b=>!op.basis_ids.includes(b)))reason='invalid_evidence';
    else if(typeof c.reason!=='string'||!c.reason.length||[...c.reason].length>120)reason='invalid_reason';
    if(reason)rejected.push({opportunity_id:typeof c?.opportunity_id==='string'?c.opportunity_id:'',reason});
    else accepted.push(c);
  }
  return {accepted,rejected};
}
