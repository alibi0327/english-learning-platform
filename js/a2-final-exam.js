(async () => {
  const profile = await bootGuard();
  if (!profile) return;
  const statusBox=document.getElementById('examStatus'), examArea=document.getElementById('examArea');
  const {data:progress}=await sb.from('lesson_progress').select('lesson_key,completed').eq('user_id',currentUser.id).eq('completed',true);
  const completed=new Set((progress||[]).map(x=>x.lesson_key));
  const done=A2_DATA.lessons.filter(l=>completed.has(l.key)).length;
  if(done!==A2_DATA.lessons.length && profile.role!=='admin'){
    statusBox.className='message error';
    statusBox.innerHTML=`Экзамен закрыт. Завершено <strong>${done}/30</strong> уроков A2.`;
    return;
  }
  const exam=A2_DATA.finalExam;
  examArea.innerHTML=`<form id="finalExamForm">${exam.map((q,i)=>`<div class="question"><strong>${i+1}. ${q.q}</strong>${q.options.map((o,j)=>`<label><input required type="radio" name="q${i}" value="${j}"> ${o}</label>`).join('')}</div>`).join('')}<button class="btn primary" type="submit">Завершить A2 Final Exam</button><div id="finalResult" class="message"></div></form>`;
  document.getElementById('finalExamForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const fd=new FormData(e.target); let correct=0;
    exam.forEach((q,i)=>{if(Number(fd.get(`q${i}`))===q.answer)correct++;});
    const score=Math.round(correct/exam.length*100), passed=score>=APP_CONFIG.PASS_SCORE;
    const result=document.getElementById('finalResult');
    const {data:course}=await sb.from('courses').select('id').eq('code','A2').single();
    const {data:attempts}=await sb.from('quiz_results').select('id').eq('user_id',currentUser.id).eq('lesson_key','a2-final');
    await sb.from('quiz_results').insert({user_id:currentUser.id,course_id:course.id,lesson_key:'a2-final',score,passed,attempt:(attempts?.length||0)+1});
    if(passed){
      const now=new Date().toISOString();
      await sb.from('lesson_progress').upsert({user_id:currentUser.id,course_id:course.id,lesson_key:'a2-final',completed:true,completed_at:now,updated_at:now},{onConflict:'user_id,course_id,lesson_key'});
      result.className='message success';
      result.innerHTML=`<h3>🎉 A2 завершён!</h3><p>Результат: <strong>${score}%</strong>.</p><a class="btn primary" href="a2-certificate.html">🎓 Получить сертификат A2</a>`;
    }else{
      result.className='message error'; result.innerHTML=`Результат: <strong>${score}%</strong>. Нужно минимум ${APP_CONFIG.PASS_SCORE}%.`;
    }
  });
})();