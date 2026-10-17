import Link from 'next/link'
import { StatusPage } from '@/components/StatusPage'

export const metadata = { title: 'Page not found | NinjaPay' }

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="This page doesn't exist"
      action={<Link href="/send" className="btn-primary">Open the app</Link>}
    >
      The address may be mistyped, or the page has moved. If someone sent you a claim link, open the
      full link they shared: it only works with everything after the # included.
    </StatusPage>
  )
}
