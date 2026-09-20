// Currency calculations use integer cents, including tax on delivery where configured.
export function reviewTotals(lines,rates){
 const knownCents=lines.reduce((sum,l)=>sum+(l.amount==null?0:Math.round(Number(l.amount)*100)),0);
 const rentalComplete=lines.every(l=>l.amount!=null&&Number.isFinite(Number(l.amount)));
 const delivery=rates?.deliveryFee,rate=rates?.taxRate;
 const hasDelivery=delivery!=null&&Number.isFinite(Number(delivery))&&Number(delivery)>=0;
 const hasTax=rate!=null&&Number.isFinite(Number(rate))&&Number(rate)>=0&&Number(rate)<=100;
 const deliveryCents=hasDelivery?Math.round(Number(delivery)*100):null;
 const taxCents=hasTax&&hasDelivery&&rentalComplete?Math.round((knownCents+(rates.taxDelivery?deliveryCents:0))*Number(rate)/100):null;
 return {rentalSubtotal:rentalComplete?knownCents/100:null,knownSubtotal:knownCents/100,deliveryFee:hasDelivery?deliveryCents/100:null,taxRate:hasTax?Number(rate):null,taxAmount:taxCents==null?null:taxCents/100,total:taxCents==null?null:(knownCents+deliveryCents+taxCents)/100,zip:/^\d{5}$/.test(rates?.zip||'')?rates.zip:null,checkedAt:rates?.checkedAt||null};
}
