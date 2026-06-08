import { Check, Users } from "lucide-react";
import Link from "next/link";
import { InvitationAcceptButton } from "@/components/invitation-accept-button";
import { requireUser } from "@/lib/supabase/server";

export default async function InvitationPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { supabase, user } = await requireUser();
  const invitationResult = supabase
    ? await supabase.rpc("get_household_invitation", {
        invitation_token: token
      })
    : { data: null, error: new Error("Supabase is not configured.") };
  const invitation = Array.isArray(invitationResult.data)
    ? invitationResult.data[0]
    : invitationResult.data;
  const lookupUnavailable = Boolean(invitationResult.error);
  const expired =
    !lookupUnavailable &&
    (!invitation || Boolean(invitation.accepted_at) || invitation.is_expired);
  const next = `/invite/${token}`;
  const invitationEmail = invitation?.email ?? "";
  const signedInEmail = user?.email ?? "";
  const emailMismatch =
    Boolean(user && invitation?.email) &&
    invitationEmail.toLowerCase() !== signedInEmail.toLowerCase();
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
        <p className="eyebrow">Gather &amp; Graze invitation</p>
        <h1>
          {expired
            ? "This invitation is no longer available"
            : lookupUnavailable
              ? "Accept household invitation"
            : `Join ${invitation?.invited_household_name ?? "the household"}`}
        </h1>
        {expired ? (
          <p>The link may have expired after seven days or already been used.</p>
        ) : lookupUnavailable ? (
          <p>
            Sign in or create an account with the email that received this link,
            then accept the household invitation.
          </p>
        ) : (
          <p>
            {invitationEmail
              ? `This single-use invitation is reserved for ${invitationEmail}. Sign in with that exact address to accept it.`
              : "This single-use invitation lets a signed-in person join the household."}
          </p>
        )}
        {!expired && user ? (
          <>
            <div className="auth-message">Signed in as {user.email}</div>
            {emailMismatch ? (
              <>
                <div className="auth-message">
                  This invitation is for {invitationEmail}. Sign in with that
                  exact email address to accept it.
                </div>
                <Link href={authHref} className="secondary-button">
                  Sign in with invited email
                </Link>
              </>
            ) : (
              <InvitationAcceptButton token={token} />
            )}
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
