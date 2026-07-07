import { MemberForm } from "@/components/forms/MemberForm";

interface SubscribePageProps {
  params: Promise<{ planId: string }>;
}

export default async function SubscribePage({
  params,
}: SubscribePageProps) {
  const { planId } = await params;

  return <MemberForm planId={planId} />;
}
