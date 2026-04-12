-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'client',
    "company" TEXT,
    "phone" TEXT,
    "photo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "inviteToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedClient" (
    "id" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qbId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,

    CONSTRAINT "ManagedClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "managedClientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "photo" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "managedClientId" TEXT NOT NULL,
    "clientCompanyName" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "linkedInvoiceId" TEXT,
    "linkedInvoiceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "managedClientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInvoice" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "qbInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL DEFAULT 'general',
    "amount" DOUBLE PRECISION,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMachine" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "nickname" TEXT,
    "ipAddress" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'Canada',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "managedClientId" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineEvent" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "notes" TEXT,
    "fromClientId" TEXT,
    "toClientId" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "fromIp" TEXT,
    "toIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "MachineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRobotProgram" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "machineId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'development',
    "dxfFilename" TEXT,
    "dxfData" TEXT,
    "waypoints" TEXT,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "acceleration" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "blendRadius" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "originX" DOUBLE PRECISION NOT NULL DEFAULT 400.0,
    "originY" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "originZ" DOUBLE PRECISION NOT NULL DEFAULT 200.0,
    "orientationRx" DOUBLE PRECISION NOT NULL DEFAULT 180.0,
    "orientationRy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "orientationRz" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "approachHeight" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "JobRobotProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLaserPreset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "machineId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'development',
    "registers" TEXT NOT NULL,
    "port" TEXT,
    "baudRate" INTEGER,
    "parity" TEXT,
    "slaveId" INTEGER,
    "rs485Mode" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "JobLaserPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineStateLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "machineId" TEXT,
    "source" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineStateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedClient_qbId_key" ON "ManagedClient"("qbId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JobMachine_jobId_machineId_key" ON "JobMachine"("jobId", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_serialNumber_key" ON "Machine"("serialNumber");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_managedClientId_fkey" FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_managedClientId_fkey" FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_managedClientId_fkey" FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvoice" ADD CONSTRAINT "JobInvoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMachine" ADD CONSTRAINT "JobMachine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMachine" ADD CONSTRAINT "JobMachine_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_managedClientId_fkey" FOREIGN KEY ("managedClientId") REFERENCES "ManagedClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "JobInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineEvent" ADD CONSTRAINT "MachineEvent_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRobotProgram" ADD CONSTRAINT "JobRobotProgram_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRobotProgram" ADD CONSTRAINT "JobRobotProgram_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLaserPreset" ADD CONSTRAINT "JobLaserPreset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLaserPreset" ADD CONSTRAINT "JobLaserPreset_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineStateLog" ADD CONSTRAINT "MachineStateLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineStateLog" ADD CONSTRAINT "MachineStateLog_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
