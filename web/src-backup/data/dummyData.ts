export interface Tender {
  id: string;
  name: string;
  client: string;
  slug: string;
  status: 'In Bearbeitung' | 'Abgeschlossen' | 'Neu';
}

export const dummyTenders: Tender[] = [
  {
    id: '1',
    name: 'EU AI Ecosystem Mapping',
    client: 'European Commission — DG CNECT',
    slug: 'eu-ai-ecosystem-mapping',
    status: 'In Bearbeitung'
  },
  {
    id: '2',
    name: 'FinTech ICT Provider Analysis',
    client: 'European Banking Authority',
    slug: 'fintech-ict-provider-analysis',
    status: 'Abgeschlossen'
  },
  {
    id: '3',
    name: 'Cybersecurity SME Landscape',
    client: 'ENISA',
    slug: 'cybersecurity-sme-landscape',
    status: 'Abgeschlossen'
  }
];