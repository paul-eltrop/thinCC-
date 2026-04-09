-- One-shot migration: translate the company_questions catalog to English.
-- Run this manually against the live Supabase project after merging the
-- English-edition branch. Each row matches by primary key id.

update company_questions set text = 'What is the company called, what legal form does it have, and where is its headquarters?' where id = 'company_name';
update company_questions set text = 'When was the company founded and what is its core mission?' where id = 'company_history';
update company_questions set text = 'How many people work at the company (FTE)?' where id = 'team_size';
update company_questions set text = 'What are the main services the company offers?' where id = 'core_services';
update company_questions set text = 'Which technology stack is primarily used (programming languages, frameworks, cloud providers)?' where id = 'tech_stack';
update company_questions set text = 'In which industries is the company most strongly positioned?' where id = 'industry_focus';
update company_questions set text = 'Which methodologies or frameworks are used as standard in projects?' where id = 'methodologies';
update company_questions set text = 'Which senior specialists does the team have and in which areas do they work?' where id = 'senior_specialists';
update company_questions set text = 'Which relevant certifications do team members hold (e.g. AWS, Azure, PMP, Scrum, CISSP)?' where id = 'team_certifications';
update company_questions set text = 'Which working languages does the team speak and at what level?' where id = 'languages_spoken';
update company_questions set text = 'What are the three most important or largest reference projects from the past three years?' where id = 'flagship_projects';
update company_questions set text = 'Are there reference projects from the EU public sector (Commission, agencies, federal ministries)? If yes, which?' where id = 'eu_public_sector_refs';
update company_questions set text = 'What is the typical contract value range of the company''s projects (from-to in EUR)?' where id = 'project_value_range';
update company_questions set text = 'Do you hold an ISO 27001 certification? If yes, since when and valid until when?' where id = 'iso_27001';
update company_questions set text = 'Do you hold an ISO 9001 certification for quality management?' where id = 'iso_9001';
update company_questions set text = 'How is GDPR compliance ensured in the company? Is there a data protection officer?' where id = 'gdpr_compliance';
update company_questions set text = 'Are NIS2 or DORA compliance requirements relevant for your projects, and are they met?' where id = 'nis2_dora_readiness';
update company_questions set text = 'What was the annual turnover for the past three financial years?' where id = 'annual_turnover';
update company_questions set text = 'Is there professional or business liability insurance? With what coverage amount?' where id = 'liability_insurance';
update company_questions set text = 'Are there current credit reports, bank references or business credit ratings that can be presented for tenders?' where id = 'financial_solvency';
