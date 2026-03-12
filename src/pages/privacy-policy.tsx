import Head from "next/head";

export default function PrivacyPolicyPage() {
	return (
		<>
			<Head>
				<title>Privacy Policy | Inbox Helper</title>
				<meta content="Privacy Policy for Inbox Helper" name="description" />
			</Head>
			<main className="min-h-screen bg-slate-100 text-slate-900">
				<div className="mx-auto w-full max-w-3xl px-6 py-10">
					<h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
					<p className="mt-2 text-sm text-slate-600">Effective date: Mar 12, 2026</p>

					<section className="mt-8 space-y-4">
						<p>
							This Privacy Policy describes how Inbox Helper ("we", "us", or "our")
							 collects, uses, and protects information when you use our website and
							 services (the "Service").
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Information We Collect</h2>
						<div className="space-y-2">
							<p>We may collect the following categories of information:</p>
							<ul className="list-disc space-y-1 pl-6">
								<li>
									Account and contact information (such as your email address) if you
									choose to provide it.
								</li>
								<li>
									Service usage information (such as basic analytics or log data).
								</li>
								<li>
									If you connect third-party accounts (for example, email), we may
									process information necessary to provide the Service.
								</li>
							</ul>
							<p className="text-sm text-slate-600">
								We aim to minimize the data we collect to only what is necessary to
								operate the Service.
							</p>
						</div>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">How We Use Information</h2>
						<ul className="list-disc space-y-1 pl-6">
							<li>To provide, maintain, and improve the Service.</li>
							<li>To respond to questions or support requests.</li>
							<li>To help prevent fraud, abuse, or security incidents.</li>
						</ul>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Information Sharing</h2>
						<div className="space-y-2">
							<p>
								Your information is{" "}
								<strong>not shared with any third-party providers</strong>. We do not
								sell your personal information.
							</p>
							<p>
								We may disclose information only if required to do so by law, legal
								process, or a valid governmental request.
							</p>
						</div>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Security</h2>
						<p>
							We take reasonable measures to protect your information and keep it
							 secure. However, no method of transmission over the Internet or method
							 of electronic storage is 100% secure.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">
							Data Retention and Deletion
						</h2>
						<p>
							We retain information only as long as necessary to provide the Service,
							 comply with legal obligations, resolve disputes, and enforce agreements.
							 You may request deletion of your information by contacting us.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Children's Privacy</h2>
						<p>
							The Service is not intended for children under 13, and we do not
							 knowingly collect personal information from children under 13.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">
							Changes to This Privacy Policy
						</h2>
						<p>
							We may update this Privacy Policy from time to time. Any changes will be
							 effective when posted on this page.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Contact Us</h2>
						<p>
							If you have questions about this Privacy Policy or want to request
							 deletion of your information, contact us at{" "}
							<a className="underline" href="mailto:antwallolive@gmail.com">
								antwallolive@gmail.com
							</a>
							.
						</p>
					</section>
				</div>
			</main>
		</>
	);
}
