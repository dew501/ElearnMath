import { notFound } from 'next/navigation';
import { FormMateri } from '@/components/form-materi';
import { UUID_RE } from '@/lib/akses';

export default function UbahMateriPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) notFound();
  return <FormMateri idMateri={params.id} />;
}
