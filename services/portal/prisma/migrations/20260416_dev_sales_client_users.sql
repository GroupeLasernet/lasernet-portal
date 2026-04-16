-- Insert dev sales user (admin with subrole=sales)
INSERT INTO "User" (email, name, password, role, subrole, company, phone, status, language, "createdAt", "updatedAt")
VALUES ('sales@lasernet.ca', 'Sales Dev', 'sales123', 'admin', 'sales', 'LaserNet', '514-555-0101', 'active', 'fr', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Insert dev client user
INSERT INTO "User" (email, name, password, role, company, phone, status, language, "createdAt", "updatedAt")
VALUES ('client@lasernet.ca', 'Client Dev', 'client123', 'client', 'LaserNet', '514-555-0102', 'active', 'fr', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;
