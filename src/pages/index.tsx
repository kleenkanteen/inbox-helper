import Head from "next/head";
import { InboxDashboard } from "#/components/inbox";

export default function Home() {
	return (
		<>
			<Head>
				<title>Inbox Helper</title>
				<meta
					content="LLM-powered Gmail bucket categorization"
					name="description"
				/>
				<link href="/favicon.ico" rel="icon" />
			</Head>
			<InboxDashboard />
		</>
	);
}
