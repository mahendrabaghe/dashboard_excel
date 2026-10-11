import { Link } from 'react-router-dom';
import { Button } from '../components/ui/index.jsx';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you are looking for does not exist or was moved.</p>
        <Link to="/app" className="mt-6 inline-block"><Button>Back to overview</Button></Link>
      </div>
    </div>
  );
}
