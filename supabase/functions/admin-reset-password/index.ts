import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return Response.json(
        { error: 'Token de autenticação ausente.' },
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return Response.json(
        { error: 'Configuração do Supabase em falta no servidor.' },
        { status: 500, headers: corsHeaders }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      return Response.json(
        { error: 'Sessão inválida ou expirada.' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin' || !profile.active) {
      return Response.json(
        { error: 'Acesso restrito a administradores ativos.' },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json().catch(() => null);
    const userId = String(body?.userId ?? '').trim();
    const password = String(body?.password ?? '').trim();

    if (!userId || password.length < 8) {
      return Response.json(
        { error: 'Utilizador inválido e/ou palavra-passe com menos de 8 caracteres.' },
        { status: 422, headers: corsHeaders }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error } = await adminClient.auth.admin.updateUser({
      user_id: userId,
      password,
    });

    if (error) {
      return Response.json(
        { error: error.message || 'Não foi possível atualizar a palavra-passe.' },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      { ok: true, message: 'Palavra-passe atualizada com sucesso.' },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível atualizar a palavra-passe.';
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
});
