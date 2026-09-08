import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Нет авторизации')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) throw new Error('Недействительная сессия')

    const { data: caller } = await admin.from('profiles')
      .select('role,status').eq('id', userData.user.id).single()

    if (!caller || caller.role !== 'admin' || caller.status !== 'active') {
      return new Response(JSON.stringify({ error:'Недостаточно прав' }), {
        status:403, headers:{...corsHeaders,'Content-Type':'application/json'}
      })
    }

    const { user_id, role, status, course_ids=[] } = await req.json()
    if (!user_id) throw new Error('Не указан пользователь')
    if (!['student','teacher','admin'].includes(role)) throw new Error('Недопустимая роль')
    if (!['active','blocked'].includes(status)) throw new Error('Недопустимый статус')

    const { error: pErr } = await admin.from('profiles').update({ role, status }).eq('id', user_id)
    if (pErr) throw pErr

    await admin.from('course_access').delete().eq('user_id', user_id)
    if (course_ids.length) {
      const { error: aErr } = await admin.from('course_access').insert(
        course_ids.map((course_id:string) => ({ user_id, course_id, allowed:true }))
      )
      if (aErr) throw aErr
    }

    return new Response(JSON.stringify({ ok:true }), {
      headers:{...corsHeaders,'Content-Type':'application/json'}
    })
  } catch (e) {
    return new Response(JSON.stringify({ error:e.message || 'Ошибка' }), {
      status:400, headers:{...corsHeaders,'Content-Type':'application/json'}
    })
  }
})
