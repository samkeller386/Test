import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | PentestGPT',
  description: 'Privacy Policy and data handling practices for PentestGPT services.',
  openGraph: {
    title: 'Privacy Policy | PentestGPT',
    description: 'Privacy Policy and data handling practices for PentestGPT services.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy | PentestGPT',
    description: 'Privacy Policy and data handling practices for PentestGPT services.',
  },
};

export const dynamic = 'force-static';

export default function PrivacyPolicyPage() {
  return (
    <div className="px-4 py-8 pb-16 md:px-0">
      <div className="dark:bg-secondary container mx-auto max-w-2xl space-y-6 rounded-md border border-gray-300 bg-white px-4 py-8 shadow-lg sm:px-8 dark:border-gray-700">
        <h1 className="mb-5 text-center text-3xl font-semibold">
          PentestGPT Privacy Policy
        </h1>

        <div className="mt-4 text-lg leading-relaxed">
          <p className="mb-6">
            Welcome to PentestGPT. This Privacy Policy explains how HackerAI LLC ("we," "us," or "our") collects, uses, shares, and protects information in relation to our website and any associated services, software, and content (collectively, the "Service"). By accessing or using our Service, you ("you" or "User") understand and agree to the collection and use of information in accordance with this policy.
          </p>

          <ul className="list-inside list-decimal">
            <li className="mb-3">
              <strong>Acknowledgement of Beta Service:</strong> You acknowledge that the Service is provided on a beta basis and may contain errors, inaccuracies, or vulnerabilities, including those related to privacy and data security. Your use of the Service signifies your understanding and acceptance of these risks.
            </li>
            <li className="mb-3">
              <strong>Information We Collect:</strong> We may collect and store any information you provide to us or that we collect in connection with your use of the Service. This may include, but is not limited to, personal information such as your email address and any data or content you create, upload, or share through the Service, including but not limited to penetration testing results, vulnerability reports, and security assessments.
            </li>
            <li className="mb-3">
              <strong>How We Use Your Information:</strong> The information we collect is used to provide, maintain, protect, and improve the Service; to develop new services; and to protect us and our users. We also use this information to offer tailored content and improve our AI-powered penetration testing capabilities.
            </li>
            <li className="mb-3">
              <strong>Information Sharing and Disclosure:</strong> We do not share personal information with companies, organizations, or individuals outside of HackerAI LLC except in the following circumstances:
              <ul className="ml-6 mt-2 list-disc">
                <li>With your consent.</li>
                <li>For legal reasons, we will share personal information if we have a good-faith belief that access, use, preservation, or disclosure of the information is reasonably necessary to meet any applicable law, regulation, legal process, or enforceable governmental request.</li>
              </ul>
            </li>
            <li className="mb-3">
              <strong>No Expectation of Privacy:</strong> By using the Service, you agree that there is no expectation of privacy. You acknowledge that the Service, being in a beta phase, may have inherent risks of privacy breaches, and you agree that HackerAI LLC assumes no liability for any such breaches.
            </li>
            <li className="mb-3">
              <strong>Security:</strong> We strive to use commercially acceptable means to protect your information, but we cannot guarantee its absolute security. Your use of the Service signifies your agreement that the risk of any data breaches or security vulnerabilities is borne solely by you.
            </li>
            <li className="mb-3">
              <strong>Changes to This Privacy Policy:</strong> We may modify this Privacy Policy at any time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
            </li>
            <li className="mb-3">
              <strong>Contact Us:</strong> If you have any questions about this Privacy Policy, please visit our help center at{' '}
              <a 
                href="https://help.hackerai.co/en/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                https://help.hackerai.co/en/
              </a>
            </li>
          </ul>

          <p className="mt-6">
            By accessing or using our Service, you acknowledge that you have read, understood, and agreed to be bound by this Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
} 