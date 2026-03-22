from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parents[5] / ".env")

import boto3
from botocore.exceptions import ClientError
from typing import Optional
import hashlib


class S3StorageService:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
        self.bucket_name = os.getenv('S3_BUCKET_NAME', 'aegisai-reports')
    
    def upload_pdf(self, file_content: bytes, report_id: str, user_id: str) -> str:
        """
        Upload PDF to S3 and return storage path
        
        Args:
            file_content: PDF file bytes
            report_id: UUID of the report
            user_id: UUID of the user
            
        Returns:
            S3 storage path (s3://bucket/path)
        """
        try:
            # Generate S3 key
            s3_key = f"reports/{user_id}/{report_id}.pdf"
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file_content,
                ContentType='application/pdf',
                ServerSideEncryption='AES256'
            )
            
            # Return storage path
            storage_path = f"s3://{self.bucket_name}/{s3_key}"
            return storage_path
            
        except ClientError as e:
            raise Exception(f"Failed to upload to S3: {str(e)}")
    
    def generate_signed_url(self, storage_path: str, expiration: int = 3600) -> str:
        """
        Generate presigned URL for S3 object
        
        Args:
            storage_path: S3 path (s3://bucket/key)
            expiration: URL expiration in seconds (default 1 hour)
            
        Returns:
            Presigned URL
        """
        try:
            # Parse S3 path
            s3_key = storage_path.replace(f"s3://{self.bucket_name}/", "")
            
            # Generate presigned URL
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': s3_key
                },
                ExpiresIn=expiration
            )
            
            return url
            
        except ClientError as e:
            raise Exception(f"Failed to generate signed URL: {str(e)}")
    
    @staticmethod
    def compute_checksum(content: bytes) -> str:
        """Compute SHA256 checksum of content"""
        return hashlib.sha256(content).hexdigest()
