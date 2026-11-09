import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // User & Access
  { name: 'users.manage', module: 'users', description: 'Create, update, delete users' },
  { name: 'users.view', module: 'users', description: 'View users list and profiles' },
  { name: 'roles.manage', module: 'roles', description: 'Create, edit roles and assign permissions' },
  { name: 'roles.view', module: 'roles', description: 'View roles and permissions' },

  // Branches & Warehouses
  { name: 'branches.manage', module: 'branches', description: 'Create and update branches' },
  { name: 'branches.view', module: 'branches', description: 'View branches' },
  { name: 'warehouses.manage', module: 'warehouses', description: 'Create and update warehouses' },
  { name: 'warehouses.view', module: 'warehouses', description: 'View warehouses' },

  // Audit & Files
  { name: 'audit_logs.view', module: 'audit_logs', description: 'View audit logs' },
  { name: 'files.manage', module: 'files', description: 'Upload, delete, and manage files' },
  { name: 'files.view', module: 'files', description: 'View and download files' },

  // Catalog (for future phases)
  { name: 'products.manage', module: 'products', description: 'Create and manage product catalog' },
  { name: 'products.view', module: 'products', description: 'View product catalog' },

  // Inventory & Logistics
  { name: 'inventory.manage', module: 'inventory', description: 'Perform stock adjustments and transfers' },
  { name: 'inventory.view', module: 'inventory', description: 'View inventory levels and movements' },

  // Sales & POS
  { name: 'sales.create', module: 'sales', description: 'Process POS checkout and create sales' },
  { name: 'sales.refund', module: 'sales', description: 'Process sales refunds and returns' },
  { name: 'sales.view', module: 'sales', description: 'View sales and shifts' },

  // Purchases
  { name: 'purchases.create', module: 'purchases', description: 'Create purchase orders' },
  { name: 'purchases.receive', module: 'purchases', description: 'Receive purchased inventory' },
  { name: 'purchases.view', module: 'purchases', description: 'View purchases and suppliers' },

  // Orders
  { name: 'orders.manage', module: 'orders', description: 'Update order status and workflow' },
  { name: 'orders.view', module: 'orders', description: 'View orders list and history' },

  // Reports
  { name: 'reports.view', module: 'reports', description: 'View financial and operational reports' },
];

async function main() {
  console.log('Seeding foundation data...');

  // 1. Seed Permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, module: perm.module },
      create: perm,
    });
  }
  console.log(`✓ Seeded ${PERMISSIONS.length} permissions`);

  // 2. Seed Default Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: { isSystem: true },
    create: {
      name: 'super_admin',
      description: 'System Super Administrator with full privileges',
      isSystem: true,
    },
  });

  const branchManagerRole = await prisma.role.upsert({
    where: { name: 'branch_manager' },
    update: {},
    create: {
      name: 'branch_manager',
      description: 'Branch Manager overseeing store operations',
      isSystem: false,
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: 'cashier' },
    update: {},
    create: {
      name: 'cashier',
      description: 'POS Cashier handling checkout and shifts',
      isSystem: false,
    },
  });

  const allPerms = await prisma.permission.findMany();

  // Attach all permissions to super_admin
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Attach branch manager permissions
  const managerPermNames = [
    'branches.view',
    'warehouses.view',
    'products.view',
    'inventory.manage',
    'inventory.view',
    'sales.create',
    'sales.refund',
    'sales.view',
    'purchases.create',
    'purchases.receive',
    'purchases.view',
    'orders.manage',
    'orders.view',
    'reports.view',
  ];
  for (const perm of allPerms.filter((p) => managerPermNames.includes(p.name))) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: branchManagerRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: branchManagerRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Attach cashier permissions
  const cashierPermNames = [
    'products.view',
    'inventory.view',
    'sales.create',
    'sales.view',
  ];
  for (const perm of allPerms.filter((p) => cashierPermNames.includes(p.name))) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: cashierRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: cashierRole.id,
        permissionId: perm.id,
      },
    });
  }
  console.log('✓ Seeded roles and role permissions');

  // 3. Seed Default Main Branch & Warehouse
  const mainBranch = await prisma.branch.upsert({
    where: { code: 'BRANCH-MAIN' },
    update: { isMain: true, isActive: true },
    create: {
      name: 'Main Flagship Branch',
      code: 'BRANCH-MAIN',
      address: 'Dhaka, Bangladesh',
      phone: '+8801700000000',
      email: 'main@erppos.local',
      isMain: true,
      isActive: true,
    },
  });

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    update: { isDefault: true, isActive: true, branchId: mainBranch.id },
    create: {
      name: 'Central Warehouse',
      code: 'WH-MAIN',
      location: 'Central Dhaka Logistics Hub',
      branchId: mainBranch.id,
      isDefault: true,
      isActive: true,
    },
  });
  console.log(`✓ Seeded branch (${mainBranch.code}) and warehouse (${mainWarehouse.code})`);

  // 4. Seed Super Admin User
  const adminEmail = 'admin@erppos.local';
  const adminPassword = 'AdminPassword123!';
  const passwordHash = await argon2.hash(adminPassword);

  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      isSuperAdmin: true,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: adminEmail,
      name: 'Super Administrator',
      phone: '+8801800000000',
      passwordHash,
      isSuperAdmin: true,
      status: UserStatus.ACTIVE,
    },
  });

  // Assign super_admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
    },
  });

  // Assign to main branch as default
  await prisma.userBranch.upsert({
    where: {
      userId_branchId: {
        userId: superAdmin.id,
        branchId: mainBranch.id,
      },
    },
    update: { isDefault: true },
    create: {
      userId: superAdmin.id,
      branchId: mainBranch.id,
      isDefault: true,
    },
  });

  console.log(`✓ Seeded Super Admin: ${adminEmail}`);
  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
