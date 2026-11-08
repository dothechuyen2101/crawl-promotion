import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@cp/shared/database';

/** Client theo phiên người dùng (tuân theo RLS). Dùng trong Server Component / Server Action / Route Handler. */
export async function serverClient() {
  const store = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Gọi từ Server Component: không ghi được cookie, proxy.ts sẽ làm mới phiên.
          }
        },
      },
    },
  );
}
