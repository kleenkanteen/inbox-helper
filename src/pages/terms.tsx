import Head from "next/head";

export default function TermsPage() {
	return (
		<>
			<Head>
				<title>Terms of Service | Inbox Helper</title>
				<meta content="Terms of Service for Inbox Helper" name="description" />
			</Head>
			<main className="min-h-screen bg-slate-100 text-slate-900">
				<div className="mx-auto w-full max-w-3xl px-6 py-10">
					<h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
					<p className="mt-2 text-sm text-slate-600">Effective date: Mar 12, 2026</p>

					<section className="mt-8 space-y-4">
						<p>
							These Terms of Service ("Terms") govern your access to and use of Inbox
							 Helper (the "Service"). By accessing or using the Service, you agree to
							 be bound by these Terms.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Use of the Service</h2>
						<ul className="list-disc space-y-1 pl-6">
							<li>You are responsible for your use of the Service.</li>
							<li>
								You agree not to misuse the Service or attempt to disrupt, harm, or gain
								 unauthorized access to the Service or related systems.
							</li>
						</ul>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">No Warranties</h2>
						<p>
							The Service is provided on an "as is" and "as available" basis. To the
							 fullest extent permitted by law, we disclaim all warranties of any kind,
							 whether express, implied, or statutory, including implied warranties of
							 merchantability, fitness for a particular purpose, and non-infringement.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Limitation of Liability</h2>
						<p>
							To the fullest extent permitted by law, Inbox Helper and its
							 contributors will not be liable for any indirect, incidental, special,
							 consequential, or punitive damages, or any loss of profits or revenues,
							 whether incurred directly or indirectly, or any loss of data, use,
							 goodwill, or other intangible losses, resulting from (a) your access to
							 or use of (or inability to access or use) the Service; (b) any conduct
							 or content of any third party; or (c) unauthorized access, use, or
							 alteration of your transmissions or content.
						</p>
						<p className="text-sm text-slate-600">
							In plain terms: you use the Service at your own risk, and we are not
							 responsible for damages or losses.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Third-Party Services</h2>
						<p>
							The Service may interact with third-party services you choose to connect
							 (for example, email providers). We are not responsible for third-party
							 services, their availability, or their content.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Termination</h2>
						<p>
							We may suspend or terminate your access to the Service at any time, with
							 or without notice, for any reason, including if we believe you have
							 violated these Terms.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Changes to These Terms</h2>
						<p>
							We may update these Terms from time to time. Any changes will be
							 effective when posted on this page. Your continued use of the Service
							 after changes become effective constitutes your acceptance of the
							 updated Terms.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Governing Law</h2>
						<p>
							These Terms are governed by the laws of the United States, without regard
							 to conflict of law principles.
						</p>

						<h2 className="pt-2 text-xl font-semibold tracking-tight">Contact</h2>
						<p>
							Questions about these Terms can be sent to{" "}
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
