import { createFileRoute } from '@tanstack/react-router';
import { Explorer } from '../explorer';
export const Route = createFileRoute('/')({ ssr: false, component: Explorer });
