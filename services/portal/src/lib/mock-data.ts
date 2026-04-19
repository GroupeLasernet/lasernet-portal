// ============================================================
// MOCK DATA FOR DEMO PURPOSES
// Replace with real database queries and QuickBooks API calls
// ============================================================

// ============================================================
// QUICKBOOKS CLIENT DATA (simulates what the API would return)
// ============================================================
export interface QBClient {
  id: string;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface ContactPerson {
  id: string;
  photo: string | null; // base64 data URL or null (shows initials avatar)
  name: string;
  email: string;
  phone: string;
  role: string;
  type?: string;
  trainingPhoto?: string | null;
  trainingInvoiceId?: string | null;
  trainingCompleted?: boolean;
  archivedAt?: string | null;
}

export interface ManagedClient {
  id: string;
  qbClient: QBClient;
  responsiblePerson: ContactPerson | null; // legacy single (first main contact)
  mainContacts: ContactPerson[];           // all active main contacts
  subEmployees: ContactPerson[];
  archivedContacts: ContactPerson[];       // archived (any type)
  addedAt: string;
}

// Simulates clients imported from QuickBooks API
export const mockQBClients: QBClient[] = [
  {
    id: 'qb-1',
    displayName: 'Jean-Pierre Tremblay',
    companyName: 'Tremblay Industries',
    email: 'jp@tremblayindustries.ca',
    phone: '514-555-0200',
    address: '456 Rue Saint-Denis',
    city: 'Montreal',
    province: 'QC',
    postalCode: 'H2J 2L1',
  },
  {
    id: 'qb-2',
    displayName: 'Marie Dubois',
    companyName: 'DesignCo',
    email: 'marie@designco.ca',
    phone: '438-555-0300',
    address: '789 Boulevard René-Lévesque',
    city: 'Quebec City',
    province: 'QC',
    postalCode: 'G1R 2A4',
  },
  {
    id: 'qb-3',
    displayName: 'François Bergeron',
    companyName: 'Bergeron Manufacturing',
    email: 'f.bergeron@bergeronmfg.ca',
    phone: '450-555-0400',
    address: '100 Rue Industrielle',
    city: 'Laval',
    province: 'QC',
    postalCode: 'H7T 1A1',
  },
  {
    id: 'qb-4',
    displayName: 'Sophie Gagnon',
    companyName: 'Gagnon Tech Solutions',
    email: 'sophie@gagnontech.ca',
    phone: '514-555-0500',
    address: '222 Avenue McGill',
    city: 'Montreal',
    province: 'QC',
    postalCode: 'H3A 1G1',
  },
  {
    id: 'qb-5',
    displayName: 'Pierre Lavoie',
    companyName: 'Lavoie Construction',
    email: 'pierre@lavoieconstruction.ca',
    phone: '819-555-0600',
    address: '55 Chemin du Lac',
    city: 'Sherbrooke',
    province: 'QC',
    postalCode: 'J1H 4A5',
  },
  {
    id: 'qb-6',
    displayName: 'Nathalie Roy',
    companyName: 'Clinique Roy',
    email: 'nathalie@cliniqueroy.ca',
    phone: '514-555-0700',
    address: '88 Rue Sainte-Catherine',
    city: 'Montreal',
    province: 'QC',
    postalCode: 'H2X 1L7',
  },
];

export interface Video {
  id: string;
  title: string;
  description: string;
  youtubeId: string;  // YouTube video ID for embedding
  category: string;
  uploadedAt: string;
  assignedTo: string[]; // client IDs who can see this video
}

export interface ClientFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  category: string;
  url: string;
  assignedTo: string[];
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  status: 'paid' | 'unpaid' | 'overdue';
  date: string;
  dueDate: string;
  items: { description: string; quantity: number; rate: number; amount: number }[];
}

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  status: 'pending' | 'accepted' | 'declined';
  date: string;
  validUntil: string;
  items: { description: string; quantity: number; rate: number; amount: number }[];
}

export const mockVideos: Video[] = [
  {
    id: 'v1',
    title: 'Getting Started with Your Network Setup',
    description: 'A walkthrough of your new network configuration and how to manage basic settings.',
    youtubeId: 'dQw4w9WgXcQ', // placeholder - replace with real video IDs
    category: 'Setup Guides',
    uploadedAt: '2024-11-15',
    assignedTo: ['2', '3'],
  },
  {
    id: 'v2',
    title: 'Security Best Practices for Your Business',
    description: 'Learn how to keep your network and data secure with these essential tips.',
    youtubeId: 'dQw4w9WgXcQ',
    category: 'Security',
    uploadedAt: '2024-12-01',
    assignedTo: ['2', '3'],
  },
  {
    id: 'v3',
    title: 'Remote Access VPN Configuration',
    description: 'Step-by-step guide to setting up and using your VPN for remote work.',
    youtubeId: 'dQw4w9WgXcQ',
    category: 'Setup Guides',
    uploadedAt: '2025-01-10',
    assignedTo: ['2'],
  },
  {
    id: 'v4',
    title: 'Backup & Disaster Recovery Overview',
    description: 'Understanding your backup system and what to do in case of data loss.',
    youtubeId: 'dQw4w9WgXcQ',
    category: 'Maintenance',
    uploadedAt: '2025-02-20',
    assignedTo: ['3'],
  },
];

export const mockFiles: ClientFile[] = [
  {
    id: 'f1',
    name: 'Network-Diagram-2024.pdf',
    type: 'PDF',
    size: '2.4 MB',
    uploadedAt: '2024-10-15',
    category: 'Documentation',
    url: '#',
    assignedTo: ['2', '3'],
  },
  {
    id: 'f2',
    name: 'Security-Audit-Report.pdf',
    type: 'PDF',
    size: '1.8 MB',
    uploadedAt: '2024-12-01',
    category: 'Reports',
    url: '#',
    assignedTo: ['2'],
  },
  {
    id: 'f3',
    name: 'Software-Licenses.xlsx',
    type: 'Excel',
    size: '340 KB',
    uploadedAt: '2025-01-05',
    category: 'Licenses',
    url: '#',
    assignedTo: ['2', '3'],
  },
  {
    id: 'f4',
    name: 'VPN-Setup-Instructions.pdf',
    type: 'PDF',
    size: '890 KB',
    uploadedAt: '2025-02-15',
    category: 'Setup Guides',
    url: '#',
    assignedTo: ['3'],
  },
];

export const mockInvoices: Invoice[] = [
  {
    id: 'inv1',
    invoiceNumber: 'INV-2024-001',
    clientId: '2',
    clientName: 'Jean-Pierre Tremblay',
    amount: 3500.00,
    status: 'paid',
    date: '2024-10-01',
    dueDate: '2024-10-31',
    items: [
      { description: 'Network Installation - 20 workstations', quantity: 1, rate: 2500, amount: 2500 },
      { description: 'Firewall Configuration', quantity: 1, rate: 750, amount: 750 },
      { description: 'Cable Management', quantity: 1, rate: 250, amount: 250 },
    ],
  },
  {
    id: 'inv2',
    invoiceNumber: 'INV-2024-002',
    clientId: '2',
    clientName: 'Jean-Pierre Tremblay',
    amount: 800.00,
    status: 'unpaid',
    date: '2025-01-15',
    dueDate: '2025-02-15',
    items: [
      { description: 'Monthly IT Support - January', quantity: 1, rate: 800, amount: 800 },
    ],
  },
  {
    id: 'inv3',
    invoiceNumber: 'INV-2024-003',
    clientId: '3',
    clientName: 'Marie Dubois',
    amount: 5200.00,
    status: 'paid',
    date: '2024-11-01',
    dueDate: '2024-12-01',
    items: [
      { description: 'Full Office Network Setup', quantity: 1, rate: 4000, amount: 4000 },
      { description: 'Wireless Access Points (x3)', quantity: 3, rate: 400, amount: 1200 },
    ],
  },
  {
    id: 'inv4',
    invoiceNumber: 'INV-2025-001',
    clientId: '3',
    clientName: 'Marie Dubois',
    amount: 1200.00,
    status: 'overdue',
    date: '2025-02-01',
    dueDate: '2025-03-01',
    items: [
      { description: 'Quarterly Maintenance', quantity: 1, rate: 900, amount: 900 },
      { description: 'Software Updates', quantity: 1, rate: 300, amount: 300 },
    ],
  },
];

export const mockQuotes: Quote[] = [
  {
    id: 'q1',
    quoteNumber: 'QUO-2025-001',
    clientId: '2',
    clientName: 'Jean-Pierre Tremblay',
    amount: 12000.00,
    status: 'pending',
    date: '2025-03-01',
    validUntil: '2025-04-01',
    items: [
      { description: 'Server Upgrade - Dell PowerEdge', quantity: 1, rate: 8000, amount: 8000 },
      { description: 'Migration Services', quantity: 1, rate: 3000, amount: 3000 },
      { description: 'Post-Migration Support (1 month)', quantity: 1, rate: 1000, amount: 1000 },
    ],
  },
  {
    id: 'q2',
    quoteNumber: 'QUO-2025-002',
    clientId: '3',
    clientName: 'Marie Dubois',
    amount: 6500.00,
    status: 'accepted',
    date: '2025-02-15',
    validUntil: '2025-03-15',
    items: [
      { description: 'Security Camera System (8 cameras)', quantity: 1, rate: 4500, amount: 4500 },
      { description: 'NVR Setup & Configuration', quantity: 1, rate: 1500, amount: 1500 },
      { description: 'Cabling & Installation', quantity: 1, rate: 500, amount: 500 },
    ],
  },
];

// ============================================================
// TICKET / SUPPORT SYSTEM
// ============================================================
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';

export interface TicketAttachment {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string; // base64 data URL for images, or video URL
}

export interface Ticket {
  id: string;
  ticketNumber: string; // e.g. "TK-0001"
  clientId: string; // managed client ID
  clientCompanyName: string;
  createdBy: { name: string; email: string; role: string }; // who created it
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  attachments: TicketAttachment[];
  linkedInvoiceId: string | null; // QB invoice ID linked by admin
  linkedInvoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}
