export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: April 7, 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
          <p>
            DSM Design Sur Mesure operating as LaserNet (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;) is committed to
            protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your
            information when you use the LaserNet Client Portal (&quot;Portal&quot;).
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">1. Information We Collect</h2>
          <p>We collect the following types of information:</p>
          <p>
            <strong>Account Information:</strong> Name, email address, phone number, and company name provided
            during account creation.
          </p>
          <p>
            <strong>QuickBooks Data:</strong> With your authorization, we access client information, invoices,
            and estimates from your QuickBooks Online account. This data is used solely to display relevant
            business information within the Portal.
          </p>
          <p>
            <strong>Usage Data:</strong> We may collect information about how you access and use the Portal,
            including login times and pages visited.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <p>
            (a) Provide and maintain the Portal; (b) Display your invoices, quotes, files, and videos;
            (c) Manage client relationships and contact information; (d) Communicate with you about your
            account or services; (e) Improve the Portal and our services.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">3. QuickBooks Integration</h2>
          <p>
            Our Portal connects to Intuit QuickBooks Online via their official API using OAuth 2.0
            authentication. We request only the permissions necessary to read client, invoice, and estimate
            data. We do not modify your QuickBooks data. Access tokens are stored securely and can be
            revoked at any time through your Intuit account settings.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">4. Data Sharing</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share
            information only in the following circumstances: (a) With your explicit consent; (b) To comply
            with legal obligations; (c) To protect our rights or the safety of our users.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">5. Data Security</h2>
          <p>
            We implement appropriate security measures to protect your information, including encrypted
            connections (HTTPS), secure token storage, and access controls. However, no method of
            transmission over the Internet is 100% secure.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">6. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active or as needed to provide
            services. QuickBooks data is fetched in real-time and is not permanently stored on our servers
            beyond temporary caching for performance.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">7. Your Rights</h2>
          <p>
            You have the right to: (a) Access the personal information we hold about you; (b) Request
            correction of inaccurate information; (c) Request deletion of your account and associated data;
            (d) Revoke QuickBooks access at any time through your Intuit account.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by
            posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 !mt-8">9. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at: finance@atelierdsm.com
          </p>
        </div>
      </div>
    </div>
  );
}
