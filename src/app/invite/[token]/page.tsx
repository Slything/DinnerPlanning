import { Check, Users } from "lucide-react";
import Link from "next/link";
import { InvitationAcceptButton } from "@/components/invitation-accept-button";
import {
  createAdminSupabaseClient,
  requireUser
} from "@/lib/supabase/server";

export default async function InvitationPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminSupabaseClient();
  const { user } = await requireUser();
  const { data: invitation } = admin
    ? await admin
        .from("household_invitations")
        .select("email,expires_at,accepted_at,households(name)")
        .eq("token", token)
        .maybeSingle()
    : { data: null };
  const household = Array.isArray(invitation?.households)
    ? invitation.households[0]
    : invitation?.households;
  const expired =
    !invitation ||
    Boolean(invitation.accepted_at);
  const next = `/invite/${token}`;
  const authHref = `/auth?next=${encodeURIComponent(next)}${
    invitation?.email
      ? `&email=${encodeURIComponent(invitation.email)}`
      : ""
  }`;

  return (
    <main className="auth-shell">
      <section className="auth-card card">
        <div className="brand-mark auth-mark">
          {expired ? <Check size={24} /> : <Users size={24} />}
        </div>
        <p className="eyebrow">Dinner Made Easy invitation</p>
        <h1>
          {expired
            ? "This invitation is no longer available"
            : `Join ${household?.name ?? "the household"}`}
        </h1>
        {expired ? (
          <p>The link may have expired after seven days or already been used.</p>
        ) : (
          <p>
            This single-use invitation is reserved for {invitation.email}.
            Sign in with that exact address to accept it.
          </p>
        )}
        {!expired && user ? (
          <>
            <div className="auth-message">Signed in as {user.email}</div>
            <InvitationAcceptButton token={token} />
          </>
        ) : !expired ? (
          <>
            <Link href={authHref} className="primary-button">
              Sign in or create account
            </Link>
          </>
        ) : (
          <Link href="/auth" className="secondary-button">
            Return to sign in
          </Link>
        )}
      </section>
    </main>
  );
}
