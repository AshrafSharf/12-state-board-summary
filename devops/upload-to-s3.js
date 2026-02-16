#!/usr/bin/env node

/**
 * Upload chapter files to AWS S3
 *
 * Usage: node upload-to-s3.js <source-path> <bucket-name> [s3-prefix] [--no-uuid]
 *
 * Arguments:
 *   source-path: File or directory to upload
 *   bucket-name: S3 bucket name
 *   s3-prefix: Optional S3 path prefix (subfolder)
 *   --no-uuid: Optional flag to disable UUID filename generation
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure AWS S3
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Load or create chapter mappings
const MAPPINGS_FILE = path.join(__dirname, 'chapter-mappings.json');

function loadChapterMappings() {
    try {
        if (fs.existsSync(MAPPINGS_FILE)) {
            const content = fs.readFileSync(MAPPINGS_FILE, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.warn('Warning: Could not load chapter-mappings.json, creating new file');
    }
    return {};
}

function saveChapterMappings(mappings) {
    try {
        fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf8');
        console.log('✅ Updated chapter-mappings.json');
    } catch (error) {
        console.error('Error: Could not save chapter-mappings.json:', error.message);
    }
}

// Extract chapter name from filename
function extractChapterName(fileName) {
    // Remove _standalone suffix and extension
    // Example: 06-app-vector-algebra_standalone.html → 06-app-vector-algebra
    return fileName
        .replace(/_standalone\.(html|htm)$/i, '')
        .replace(/\.(html|htm)$/i, '');
}

// Generate UUID for unique filenames
function generateUUID() {
    return crypto.randomUUID();
}

// Generate unique filename with UUID
function generateUniqueFilename(originalFileName, useUUID = true) {
    if (!useUUID) {
        return originalFileName;
    }

    const ext = path.extname(originalFileName);
    const basename = path.basename(originalFileName, ext);
    const uuid = generateUUID();
    return `${basename}-${uuid}${ext}`;
}

/**
 * Upload a single file to S3
 */
async function uploadFile(filePath, bucketName, s3Key, contentType) {
    try {
        const fileContent = fs.readFileSync(filePath);

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: fileContent,
            ContentType: contentType || 'application/octet-stream'
        });

        await s3Client.send(command);

        const s3Url = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;

        console.log(`✅ Uploaded: ${s3Key}`);
        console.log(`   URL: ${s3Url}`);

        return {
            success: true,
            originalKey: path.basename(filePath),
            s3Key: s3Key,
            url: s3Url
        };
    } catch (error) {
        console.error(`❌ Upload failed for ${filePath}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Upload directory (recursively)
 */
async function uploadDirectory(dirPath, bucketName, s3Prefix = '', useUUID = true) {
    const files = fs.readdirSync(dirPath);
    const results = [];
    const chapterMappings = loadChapterMappings();

    // Only upload HTML files
    const htmlFiles = files.filter(file => /\.(html|htm)$/i.test(file));

    if (htmlFiles.length === 0) {
        console.warn('Warning: No HTML files found in directory');
        return results;
    }

    for (const file of htmlFiles) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Recursively upload subdirectories
            const subPrefix = s3Prefix ? `${s3Prefix}/${file}` : file;
            const subResults = await uploadDirectory(filePath, bucketName, subPrefix, useUUID);
            results.push(...subResults);
        } else {
            // Upload file
            const uniqueFileName = generateUniqueFilename(file, useUUID);
            const s3Key = s3Prefix ? `${s3Prefix}/${uniqueFileName}` : uniqueFileName;
            const contentType = getContentType(file);

            const result = await uploadFile(filePath, bucketName, s3Key, contentType);

            if (result.success) {
                results.push(result);

                // Extract chapter name and update mappings
                const chapterName = extractChapterName(file);
                if (chapterName) {
                    chapterMappings[chapterName] = {
                        fileName: uniqueFileName,
                        s3Key: s3Key,
                        url: result.url,
                        lastUpdated: new Date().toISOString()
                    };

                    console.log(`📝 Mapped chapter: ${chapterName}`);
                }
            }
        }
    }

    // Save updated mappings
    if (Object.keys(chapterMappings).length > 0) {
        saveChapterMappings(chapterMappings);
    }

    return results;
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf'
    };

    return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node upload-to-s3.js <source-path> <bucket-name> [s3-prefix] [--no-uuid]');
        console.error('');
        console.error('Arguments:');
        console.error('  source-path: File or directory to upload');
        console.error('  bucket-name: S3 bucket name');
        console.error('  s3-prefix: Optional S3 path prefix (subfolder)');
        console.error('  --no-uuid: Optional flag to disable UUID filename generation');
        console.error('');
        console.error('Example:');
        console.error('  node upload-to-s3.js ./build robogebra-dev-assets html/CHAPTER_SUMMARY');
        process.exit(1);
    }

    const sourcePath = args[0];
    const bucketName = args[1];
    const s3Prefix = args[2] && !args[2].startsWith('--') ? args[2] : '';
    const useUUID = !args.includes('--no-uuid');

    // Validate AWS credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error('Error: AWS credentials not found');
        console.error('Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables');
        process.exit(1);
    }

    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
        console.error(`Error: Source path does not exist: ${sourcePath}`);
        process.exit(1);
    }

    console.log('📦 Starting upload to S3...');
    console.log(`   Source: ${sourcePath}`);
    console.log(`   Bucket: ${bucketName}`);
    console.log(`   Prefix: ${s3Prefix || '(none)'}`);
    console.log(`   UUID filenames: ${useUUID ? 'enabled' : 'disabled'}`);
    console.log('');

    const stat = fs.statSync(sourcePath);
    let results = [];

    if (stat.isDirectory()) {
        results = await uploadDirectory(sourcePath, bucketName, s3Prefix, useUUID);
    } else {
        const fileName = path.basename(sourcePath);
        const uniqueFileName = generateUniqueFilename(fileName, useUUID);
        const s3Key = s3Prefix ? `${s3Prefix}/${uniqueFileName}` : uniqueFileName;
        const contentType = getContentType(fileName);

        const result = await uploadFile(sourcePath, bucketName, s3Key, contentType);

        if (result.success) {
            results.push(result);

            // Update chapter mappings
            const chapterName = extractChapterName(fileName);
            if (chapterName) {
                const chapterMappings = loadChapterMappings();
                chapterMappings[chapterName] = {
                    fileName: uniqueFileName,
                    s3Key: s3Key,
                    url: result.url,
                    lastUpdated: new Date().toISOString()
                };
                saveChapterMappings(chapterMappings);
                console.log(`📝 Mapped chapter: ${chapterName}`);
            }
        }
    }

    console.log('');
    console.log('=========================================');
    console.log(`✅ Upload complete! ${results.length} file(s) uploaded`);
    console.log('=========================================');

    if (results.length === 0) {
        process.exit(1);
    }
}

// Run main function
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
