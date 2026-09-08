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
      return new Response(JSON.stringify({ error: 'Недостаточно прав' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type':'application/json' }
      })
    }

    const body = await req.json()
    const { full_name, email, password, role='student', course_ids=[] } = body
    if (!email || !password || password.length < 8) throw new Error('Нужны email и пароль минимум 8 символов')
    if (!['student','teacher'].includes(role)) throw new Error('Недопустимая роль')

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name }
    })
    if (createError) throw createError

    const uid = created.user.id
    await admin.from('profiles').update({ full_name, role, status:'active' }).eq('id', uid)

    if (course_ids.length) {
      await admin.from('course_access').upsert(
        course_ids.map((course_id:string) => ({ user_id:uid, course_id, allowed:true })),
        { onConflict:'user_id,course_id' }
      )
    }

    return new Response(JSON.stringify({ ok:true, user_id:uid }), {
      headers: { ...corsHeaders, 'Content-Type':'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Ошибка' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type':'application/json' }
    })
  }
})
