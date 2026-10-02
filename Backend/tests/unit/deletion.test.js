import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  deleteDocumentStorageFiles,
  deleteCompanyStorageFiles,
} from '../../src/services/storage.service.js';
import { deleteDocument } from '../../src/controllers/document.controller.js';
import { deleteCompany, purgeCompanyData } from '../../src/controllers/company.controller.js';
import prisma from '../../src/lib/prisma.js';

// Mock fs and prisma
vi.mock('fs');
vi.mock('../../src/lib/prisma.js', () => {
  return {
    default: {
      document: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      company: {
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      financialPeriod: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      screeningResult: {
        deleteMany: vi.fn(),
      },
      screeningRatioDetail: {
        deleteMany: vi.fn(),
      },
      normalizedFact: {
        deleteMany: vi.fn(),
      },
      rawFact: {
        deleteMany: vi.fn(),
      },
      documentPage: {
        deleteMany: vi.fn(),
      },
      extractionJob: {
        deleteMany: vi.fn(),
      },
      marketData: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('Deletion & Purge Services and Controllers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Storage File Cleaners', () => {
    it('deletes stored PDF file and rendered directory when they exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

      deleteDocumentStorageFiles('doc-123', '/path/to/test.pdf');

      expect(unlinkSpy).toHaveBeenCalledWith('/path/to/test.pdf');
      expect(rmSpy).toHaveBeenCalledWith(
        expect.stringContaining('doc-123'),
        { recursive: true, force: true }
      );
    });

    it('cleans up company reports directory and all its documents', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

      const documents = [
        { id: 'doc-1', storedFilePath: '/uploads/reports/MARICO/2026/doc1.pdf' },
        { id: 'doc-2', storedFilePath: '/uploads/reports/MARICO/2026/doc2.pdf' },
      ];

      deleteCompanyStorageFiles('MARICO', documents);

      expect(unlinkSpy).toHaveBeenCalledWith('/uploads/reports/MARICO/2026/doc1.pdf');
      expect(unlinkSpy).toHaveBeenCalledWith('/uploads/reports/MARICO/2026/doc2.pdf');
      expect(rmSpy).toHaveBeenCalledWith(
        expect.stringContaining('MARICO'),
        { recursive: true, force: true }
      );
    });
  });

  describe('Document Deletion Controller', () => {
    it('deletes document and cascades removal of orphaned financial period', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

      const mockDoc = {
        id: 'doc-100',
        originalFilename: 'test_report.pdf',
        storedFilePath: '/uploads/test_report.pdf',
        financialPeriodId: 'fp-100',
        company: { dseSymbol: 'GP' },
        financialPeriod: {
          documents: [{ id: 'doc-100' }],
        },
      };

      prisma.document.findUnique.mockResolvedValue(mockDoc);
      prisma.document.delete.mockResolvedValue(mockDoc);
      prisma.financialPeriod.findUnique.mockResolvedValue({
        id: 'fp-100',
        documents: [], // no remaining documents
      });
      prisma.financialPeriod.delete.mockResolvedValue({});

      const req = { params: { id: 'doc-100' } };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();

      await deleteDocument(req, res, next);

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-100' } });
      expect(prisma.financialPeriod.delete).toHaveBeenCalledWith({ where: { id: 'fp-100' } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('deleted'),
        })
      );
    });

    it('returns 404 when document to delete does not exist', async () => {
      prisma.document.findUnique.mockResolvedValue(null);

      const req = { params: { id: 'non-existent' } };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();

      await deleteDocument(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('not found'),
        })
      );
    });
  });

  describe('Company Deletion & Purge Controllers', () => {
    it('deletes company and all physical storage files permanently', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

      const mockCompany = {
        id: 'comp-1',
        dseSymbol: 'SQURPHARMA',
        name: 'Square Pharmaceuticals PLC',
        documents: [
          { id: 'doc-1', storedFilePath: '/uploads/squr1.pdf' },
        ],
      };

      prisma.company.findFirst.mockResolvedValue(mockCompany);
      prisma.company.delete.mockResolvedValue(mockCompany);

      const req = { params: { id: 'SQURPHARMA' } };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();

      await deleteCompany(req, res, next);

      expect(prisma.company.delete).toHaveBeenCalledWith({ where: { id: 'comp-1' } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('permanently deleted'),
        })
      );
    });

    it('purges all child records and files while retaining company entity', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

      const mockCompany = {
        id: 'comp-2',
        dseSymbol: 'MARICO',
        documents: [],
      };

      prisma.company.findFirst.mockResolvedValue(mockCompany);
      prisma.$transaction.mockResolvedValue([]);

      const req = { params: { id: 'MARICO' } };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();

      await purgeCompanyData(req, res, next);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.company.delete).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('purged'),
        })
      );
    });
  });
});
