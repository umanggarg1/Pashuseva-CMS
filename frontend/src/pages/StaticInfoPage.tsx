import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function StaticInfoPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Content for this page is coming soon.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Back to home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
