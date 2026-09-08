(async()=>{const profile=await bootGuard();if(!profile)return;
const {data:p}=await sb.from('lesson_progress').select('completed_at').eq('user_id',currentUser.id).eq('lesson_key','a2-final').eq('completed',true).maybeSingle();
const gate=document.getElementById('certificateGate'),cert=document.getElementById('certificate');
if(!p){gate.className='message error';gate.textContent='Сертификат A2 доступен после успешного A2 Final Exam.';cert.style.display='none';document.getElementById('printCertificate').style.display='none';return;}
const {data:scores}=await sb.from('quiz_results').select('score').eq('user_id',currentUser.id).eq('lesson_key','a2-final').eq('passed',true).order('score',{ascending:false}).limit(1);
const date=new Date(p.completed_at||Date.now());document.getElementById('certificateName').textContent=profile.full_name||currentUser.email||'Student';
document.getElementById('certificateScore').textContent=`${scores?.[0]?.score||80}%`;document.getElementById('certificateDate').textContent=date.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
document.getElementById('certificateId').textContent=`A2-${date.getFullYear()}-${String(currentUser.id).replace(/-/g,'').slice(-8).toUpperCase()}`;
gate.className='message success';gate.textContent='Сертификат A2 подтверждён результатом итогового экзамена.';
document.getElementById('printCertificate').addEventListener('click',()=>window.print());})();