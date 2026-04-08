export interface Company {
  name: string;
  website?: string;
  description?: string;
  foundedYear?: string;
  headquarters?: string;
  employeeCount?: string;
  industry?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  dayRate: number;
  availability?: string;
}

export interface SelectedTeamMember {
  memberId: string;
  plannedDays: number;
}

export interface FileMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: 'CV' | 'Project' | 'Boilerplate' | 'Methodology';
  file: FileMetadata;
}

export interface Tender {
  id: string;
  name: string;
  client: string;
  slug: string;
  reference?: string;
  deadline?: string;
  estimatedValue?: string;
  description?: string;
  status: 'new' | 'fit-check' | 'drafting' | 'submitted';
  tenderDocument?: FileMetadata;
  additionalDocuments: FileMetadata[];
  selectedTeam: SelectedTeamMember[];
}

export const dummyCompany: Company = {
  name: 'Meridian Intelligence GmbH',
  website: 'https://meridian-intelligence.eu',
  description: 'Evidence-based market intelligence, web data analysis',
  foundedYear: '2018',
  headquarters: 'Berlin, Germany',
  employeeCount: '12',
  industry: 'Evidence-based market intelligence, web data analysis'
};

export const dummyTeam: TeamMember[] = [
  { id: '1', name: 'Dr. Anna Becker', role: 'Project Director', dayRate: 1450 },
  { id: '2', name: 'Thomas Vogel', role: 'Technical Lead', dayRate: 1100 },
  { id: '3', name: 'Sofia Chen', role: 'Policy Lead', dayRate: 1100 },
  { id: '4', name: 'Marcus Weber', role: 'Data Scientist', dayRate: 1050 },
  { id: '5', name: 'Julia Schneider', role: 'Research Analyst', dayRate: 850 },
  { id: '6', name: 'Andrei Popescu', role: 'Junior Data Engineer', dayRate: 750 }
];

export const dummyKnowledgeBase: Document[] = [
  // CVs
  { id: 'cv1', name: 'Dr. Anna Becker CV', type: 'CV', file: { id: 'f1', name: 'anna-becker-cv.pdf', type: 'pdf', size: 2048576, uploadedAt: '2024-01-15' } },
  { id: 'cv2', name: 'Thomas Vogel CV', type: 'CV', file: { id: 'f2', name: 'thomas-vogel-cv.pdf', type: 'pdf', size: 1876543, uploadedAt: '2024-01-15' } },
  // Projects
  { id: 'p1', name: 'EU AI Ecosystem Report', type: 'Project', file: { id: 'f3', name: 'eu-ai-report.pdf', type: 'pdf', size: 5242880, uploadedAt: '2024-02-01' } },
  // Boilerplate
  { id: 'b1', name: 'Company Profile Template', type: 'Boilerplate', file: { id: 'f4', name: 'company-profile.docx', type: 'docx', size: 102400, uploadedAt: '2024-01-10' } }
];

export const dummyTenders: Tender[] = [
  {
    id: '1',
    name: 'EU AI Ecosystem Mapping',
    client: 'European Commission — DG CNECT',
    slug: 'eu-ai-ecosystem-mapping',
    status: 'fit-check',
    reference: 'CNECT/2024/001',
    deadline: '2024-05-15',
    estimatedValue: '€250,000',
    description: 'Comprehensive mapping of AI ecosystem in Europe',
    tenderDocument: { id: 'td1', name: 'tender-doc.pdf', type: 'pdf', size: 1048576, uploadedAt: '2024-03-01' },
    additionalDocuments: [],
    selectedTeam: [
      { memberId: '1', plannedDays: 45 },
      { memberId: '2', plannedDays: 130 }
    ]
  },
  {
    id: '2',
    name: 'FinTech ICT Provider Analysis',
    client: 'European Banking Authority',
    slug: 'fintech-ict-provider-analysis',
    status: 'submitted',
    reference: 'EBA/2024/002',
    deadline: '2024-04-30',
    estimatedValue: '€180,000',
    description: 'Analysis of ICT providers in FinTech sector',
    tenderDocument: { id: 'td2', name: 'eba-tender.pdf', type: 'pdf', size: 2097152, uploadedAt: '2024-02-15' },
    additionalDocuments: [
      { id: 'ad1', name: 'compliance-doc.pdf', type: 'pdf', size: 512000, uploadedAt: '2024-03-10' }
    ],
    selectedTeam: [
      { memberId: '3', plannedDays: 85 },
      { memberId: '4', plannedDays: 110 }
    ]
  },
  {
    id: '3',
    name: 'Cybersecurity SME Landscape',
    client: 'ENISA',
    slug: 'cybersecurity-sme-landscape',
    status: 'drafting',
    reference: 'ENISA/2024/003',
    deadline: '2024-06-01',
    estimatedValue: '€320,000',
    description: 'Landscape analysis of cybersecurity SMEs',
    tenderDocument: undefined,
    additionalDocuments: [],
    selectedTeam: [
      { memberId: '5', plannedDays: 90 },
      { memberId: '6', plannedDays: 60 }
    ]
  }
];