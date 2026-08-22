// V0.6 refund aware cash up totals
window.todayRefunds=()=>{let today=localDate();return (data.refunds||[]).filter(r=>zaDate(r.created_at)===today)};
window.methodTotal=method=>todayPayments().filter(p=>p.method===method).reduce((s,p)=>s+Number(p.amount),0)-todayRefunds().filter(r=>r.method===method).reduce((s,r)=>s+Number(r.amount),0);
if(profile){renderCashup();renderDashboard();}
