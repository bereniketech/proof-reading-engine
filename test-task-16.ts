import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const BACKEND_URL = 'http://localhost:3001';
const SAMPLES_DIR = path.join(process.cwd(), 'samples');

interface UploadResponse {
  success: boolean;
  data?: {
    sessionId: string;
    status: string;
  };
  error?: string;
}

interface SessionResponse {
  success: boolean;
  data?: {
    session: {
      id: string;
      status: string;
      filename: string;
    };
    sections: Array<{
      id: string;
      status: string;
      original_text: string;
      corrected_text: string | null;
      final_text: string | null;
    }>;
  };
  error?: string;
}

interface ExportResponse {
  success: boolean;
  data?: {
    pdf: string; // base64 encoded
  };
  error?: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadFiles(): Promise<string | null> {
  try {
    console.log('📤 Starting file upload...');

    const maternalFile = path.join(SAMPLES_DIR, 'Maternal Fatigue Among Mothers of Children with Autism Spectrum Disorder A Cross-Sectional Questionnaire Study_.pdf');
    const referenceFile = path.join(SAMPLES_DIR, 'CIEY2645341.pdf');

    if (!fs.existsSync(maternalFile)) {
      console.error('❌ Maternity file not found:', maternalFile);
      return null;
    }

    if (!fs.existsSync(referenceFile)) {
      console.error('❌ Reference file not found:', referenceFile);
      return null;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(maternalFile));
    form.append('reference', fs.createReadStream(referenceFile));

    const response = await axios.post<UploadResponse>(`${BACKEND_URL}/api/upload`, form, {
      headers: form.getHeaders(),
    });

    if (!response.data.success || !response.data.data?.sessionId) {
      console.error('❌ Upload failed:', response.data.error || 'Unknown error');
      return null;
    }

    console.log('✅ Upload successful! Session ID:', response.data.data.sessionId);
    console.log('   Status:', response.data.data.status);

    return response.data.data.sessionId;
  } catch (error) {
    console.error('❌ Upload error:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function waitForProofreadingCompletion(sessionId: string, maxWaitTime: number = 120000): Promise<boolean> {
  console.log('\n⏳ Waiting for proofreading to complete...');

  const startTime = Date.now();
  let sections: SessionResponse['data']?.sections | null = null;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await axios.get<SessionResponse>(`${BACKEND_URL}/api/sessions/${sessionId}`);

      if (response.data.success && response.data.data?.session) {
        const session = response.data.data.session;
        sections = response.data.data.sections;

        console.log(`   Status: ${session.status} (${sections?.length || 0} sections)`);

        if (session.status === 'proofreading') {
          // Check if all sections are ready
          const allReady = sections?.every((s) => s.status !== 'pending');
          if (allReady && sections && sections.length > 0) {
            console.log('✅ All sections proofread!');
            return true;
          }
        }
      }

      await delay(2000);
    } catch (error) {
      console.error('   Error checking status:', error instanceof Error ? error.message : error);
    }
  }

  console.error('❌ Timeout waiting for proofreading');
  return false;
}

async function getSessionDetails(sessionId: string): Promise<SessionResponse['data'] | null> {
  try {
    const response = await axios.get<SessionResponse>(`${BACKEND_URL}/api/sessions/${sessionId}`);

    if (response.data.success) {
      return response.data.data || null;
    }

    console.error('❌ Failed to get session details:', response.data.error);
    return null;
  } catch (error) {
    console.error('❌ Error getting session details:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function exportSession(sessionId: string): Promise<Buffer | null> {
  try {
    console.log('\n📥 Exporting proofread PDF...');

    const response = await axios.post<ExportResponse>(
      `${BACKEND_URL}/api/export/${sessionId}`,
      {},
      {
        responseType: 'arraybuffer',
      },
    );

    console.log('✅ Export successful!');
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Export error:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Task 16: E2E Proof-Reading Workflow Test');
  console.log('==========================================\n');

  // Step 1: Upload files
  const sessionId = await uploadFiles();
  if (!sessionId) {
    console.error('Failed to upload files');
    process.exit(1);
  }

  // Give it a moment to start processing
  await delay(2000);

  // Step 2: Wait for proofreading
  const completed = await waitForProofreadingCompletion(sessionId);
  if (!completed) {
    console.error('Proofreading did not complete in time');
    process.exit(1);
  }

  // Step 3: Get session details
  const sessionData = await getSessionDetails(sessionId);
  if (!sessionData) {
    console.error('Failed to get session details');
    process.exit(1);
  }

  console.log('\n📊 Session Summary:');
  console.log('   Filename:', sessionData.session.filename);
  console.log('   Status:', sessionData.session.status);
  console.log('   Total sections:', sessionData.sections.length);
  console.log('   Sections by status:');

  const statusCounts: Record<string, number> = {};
  for (const section of sessionData.sections) {
    statusCounts[section.status] = (statusCounts[section.status] || 0) + 1;
  }
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`     - ${status}: ${count}`);
  }

  // Step 4: Export PDF
  const pdfBuffer = await exportSession(sessionId);
  if (pdfBuffer) {
    const outputPath = path.join(process.cwd(), `proofread_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(`   Saved to: ${outputPath}`);
  }

  console.log('\n✅ Task 16 completed successfully!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
