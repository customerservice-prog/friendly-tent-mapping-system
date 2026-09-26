import { normalizeScanCheck, scanInputFingerprint } from '../core/scan-validation.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ft=n=>Number.isFinite(n)?n.toFixed(2)+' ft':'—';
export function scanValidationPanel(scan,runtime){
  const center=scan.frames?.find(f=>f.role==='center');if(!center)return '';
  const check=normalizeScanCheck(scan.validationCheck),sourceId=center.id||center.url;
  const supplied=runtime?.validation,report=supplied?.checkFingerprint===scanInputFingerprint(check)?supplied:null;
  const marker=(p,label)=>p?'<circle cx="'+p.u*100+'" cy="'+p.v*100+'" r="1.6" fill="#fff" stroke="#173b37" stroke-width=".6"/><text x="'+(p.u*100+2.5)+'" y="'+(p.v*100-2)+'" font-size="5" fill="#fff" stroke="#173b37" stroke-width=".4" paint-order="stroke">'+label+'</text>':'';
  const overlay=(check.a&&check.b?'<line x1="'+check.a.u*100+'" y1="'+check.a.v*100+'" x2="'+check.b.u*100+'" y2="'+check.b.v*100+'" stroke="#fff" stroke-width=".7"/>':'')+marker(check.a,'A')+marker(check.b,'B');
  const evidence=report?.evidence;
  return '<section class="scan-validation" aria-label="Independent scan distance check">'+
    '<h5>Check a separate physical distance</h5><p>Choose two fixed, textured points at least 3 ft apart. Measure their direct distance with a tape or laser. This distance checks the result; it never sets scan scale. Do not reuse the camera travel distance.</p>'+
    '<button type="button" class="scan-check-image" data-role="scan-check-image" data-frame-id="'+esc(sourceId)+'" aria-label="Mark '+(!check.a?'first':!check.b?'second':'new first')+' check endpoint on the center photo" style="position:relative;display:block;width:100%;padding:0;border:0;cursor:crosshair;overflow:hidden;border-radius:8px"><img src="'+esc(center.url)+'" alt="Center capture for the independent measurement" style="display:block;width:100%;height:auto;pointer-events:none"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">'+overlay+'</svg></button>'+
    '<p class="equipment-note">'+(!check.a?'Mark A on the photo, then B.':!check.b?'A is marked. Now mark B.':'A and B marked. Another click starts a new segment.')+'</p>'+
    '<details><summary>Adjust endpoints with keyboard</summary>'+['a','b'].map(key=>'<div class="scan-check-coordinates"><strong>'+key.toUpperCase()+'</strong>'+['u','v'].map(axis=>'<label>'+ (axis==='u'?'Across':'Down')+' % <input type="number" min="0" max="100" step=".1" inputmode="decimal" data-role="scan-check-coordinate" data-point="'+key+'" data-axis="'+axis+'" data-frame-id="'+esc(sourceId)+'" value="'+(check[key]?(check[key][axis]*100).toFixed(1):'')+'"></label>').join('')+'</div>').join('')+'</details>'+
    '<label class="venue-scan-baseline"><span>Independent distance A → B</span><div><input type="number" min="3" max="500" step=".01" inputmode="decimal" data-role="scan-check-distance" value="'+(check.distanceFt??'')+'" placeholder="Measured distance"><strong>ft</strong></div></label>'+
    '<div class="scan-check-result" role="status" data-status="'+esc(report?.status||'insufficient')+'"><strong>'+esc(report?.label||'Open 3D Scan to compute this check')+'</strong>'+
    (report?.predictedFt!=null?'<dl><dt>Measured</dt><dd>'+ft(report.measuredFt)+'</dd><dt>Scan predicts</dt><dd>'+ft(report.predictedFt)+'</dd><dt>Difference</dt><dd>'+ft(Math.abs(report.residualFt))+' · '+(report.relativeError*100).toFixed(1)+'%</dd><dt>Allowed tolerance</dt><dd>'+ft(report.toleranceFt)+'</dd></dl>':'')+
    (report?.reasons||[]).map(reason=>'<p>'+esc(reason)+'</p>').join('')+'</div>'+
    (evidence?'<p class="equipment-note">Observed coverage '+Math.round(evidence.observedCoverage*100)+'% of sampled grid · agreed from both sides '+Math.round(evidence.bilateralCoverage*100)+'% · capture score '+(evidence.captureScore??'—')+'/100. Camera motion '+(evidence.pose?.eligible?'supports this limited check':'needs more evidence')+'. Full camera pose remains unresolved.</p>':'')+
    '<button type="button" class="btn-tertiary" data-role="scan-check-reset">Clear check points</button><p class="equipment-note">A passing check applies only to A → B. This is an estimated scene, not a surveyed venue or an installation approval.</p></section>';
}
