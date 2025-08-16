# ActiveCampaign Data Fetcher

A Node.js tool for fetching and processing ActiveCampaign campaign data with message relationships, validation, and filtering capabilities.

## Prerequisites

- **Node.js** (version 14 or higher) - [Download here](https://nodejs.org/)
- **ActiveCampaign Account** with API access
- **API Token** from your ActiveCampaign account settings

## Quick Start

1. **Clone or download this repository**
2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up your API credentials:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your ActiveCampaign details:
   ```
   ACTIVECAMPAIGN_BASE_URL=https://youraccountname.api-us1.com
   ACTIVECAMPAIGN_API_TOKEN=your_api_token_here
   ```

4. **Run the script:**
   ```bash
   node fetch-campaigns.js
   ```

## Finding Your ActiveCampaign API Details

### Base URL
Your base URL follows this pattern: `https://YOURACCOUNTNAME.api-us1.com`
- Replace `YOURACCOUNTNAME` with your actual account name
- You can find this in your ActiveCampaign dashboard URL

### API Token
1. Log into your ActiveCampaign account
2. Go to Settings → Developer
3. Copy your API URL and API Key
4. The API Key is your token

## Configuration

The script uses a configuration object in `fetch-campaigns.js` that you can customize:

### Processing Mode
- `isTestMode: true` - Processes only one batch (100 campaigns) for testing
- `isTestMode: false` - Processes ALL campaigns in your account

### Performance Settings
- `delayBetweenRequests: 1000` - Milliseconds between API calls (adjust if hitting rate limits)
- `batchSize: 100` - Campaigns per API request (don't exceed ActiveCampaign's limit)

### Filtering Options
- **Status Filter**: Choose which campaign statuses to include
  - `0` - Draft campaigns
  - `1` - Scheduled campaigns  
  - `2` - Currently sending
  - `3` - Paused campaigns
  - `4` - Stopped campaigns
  - `5` - Completed campaigns (recommended)

- **Automation Filter**: 
  - `0` - Regular email campaigns (newsletters, blasts)
  - `1` - Automation campaigns (drip sequences, triggered emails)

## Core Functions

### `fetchCampaignsWithMessages(offset, limit)`
- Fetches campaigns from ActiveCampaign API with included message data
- Handles pagination and rate limiting
- Returns raw API response data

### `campaignMatchesFilters(campaign)`
- Applies status and automation filters to individual campaigns
- Returns boolean indicating if campaign should be included
- Respects the `filterEnabled` configuration setting

### `createLookupMaps(data)`
- Creates efficient lookup maps for messages and campaign-message relationships
- Optimizes data processing for large datasets
- Returns Map objects for fast data retrieval

### `validateRelationships(campaign, campaignMessage, message)`
- Validates data integrity between campaigns, campaignMessages, and messages
- Identifies missing relationships and data inconsistencies
- Returns array of validation errors

### `restructureCampaignData(data)`
- Main processing function that combines campaign data with associated messages
- Applies filters and validation
- Creates enriched campaign objects with metadata

### `getAllCampaignsRestructured()`
- Orchestrates the entire data fetching and processing workflow
- Handles batching, progress tracking, and error logging
- Saves final results and generates summary statistics

## Output Files

### Primary Output: `exported_campaigns.json`
**Format:** JSON  
**Content:** Complete processed campaign data with summary statistics

**Structure:**
```json
{
  "summary": {
    "totalProcessed": 150,
    "totalMatchingFilters": 45,
    "totalWithErrors": 2,
    "duration": 12.5,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "isTestMode": true,
    "filterSettings": {
      "enabled": true,
      "status": { "enabled": true, "value": 5 },
      "automation": { "enabled": true, "value": 0 }
    }
  },
  "campaigns": [
    {
      "id": "123",
      "name": "Newsletter January 2024",
      "status": "5",
      "automation": null,
      "message": {
        "id": "456",
        "subject": "January Newsletter",
        "html": "...",
        "text": "..."
      },
      "campaignMessage": {
        "campaign": "123",
        "messageid": "456"
      },
      "_metadata": {
        "hasValidRelationships": true,
        "validationErrors": []
      }
    }
  ]
}
```

### Error Log: `relationship_errors.log`
**Format:** Plain text with timestamps  
**Content:** Data validation errors and processing issues

**Example:**
```
2024-01-15T10:30:15.123Z: No campaign message found for campaign ID: 789
2024-01-15T10:30:15.124Z: Message ID mismatch for campaign 456
```

## Data Processing Workflow

1. **Fetch** - Retrieves campaigns with included message data from ActiveCampaign API
2. **Filter** - Applies status and automation filters based on configuration
3. **Validate** - Checks data integrity between campaigns, messages, and relationships
4. **Restructure** - Combines related data into unified campaign objects
5. **Save** - Outputs processed data to JSON file with summary statistics

## Troubleshooting

### Common Issues

**"API Token Invalid"**
- Verify your API token is correct in `.env`
- Check that your ActiveCampaign account has API access enabled

**"Rate Limit Exceeded"**
- Increase `delayBetweenRequests` in the configuration
- ActiveCampaign typically allows 5 requests per second

**"No campaigns found"**
- Check your filter settings - they might be too restrictive
- Set `filterEnabled: false` to see all campaigns
- Verify your ActiveCampaign account has campaigns

**"Memory issues with large datasets"**
- Enable `isTestMode: true` for initial testing
- Reduce `batchSize` if needed
- Process data in smaller chunks

### Debug Mode
To see detailed processing information, check the console output while the script runs. It shows:
- Current processing mode (TEST/PRODUCTION)
- Active filters
- Batch processing progress
- Final statistics

## Advanced Usage

### Custom Filtering
Modify the filter configuration in `fetch-campaigns.js`:

```javascript
// Get only scheduled campaigns
filters: {
  status: { enabled: true, value: 1 },
  automation: { enabled: false }
}

// Get all automation sequences
filters: {
  status: { enabled: false },
  automation: { enabled: true, value: 1 }
}

// Disable all filtering
filterEnabled: false
```

### Performance Optimization
For large accounts (1000+ campaigns):
- Start with `isTestMode: true` to verify configuration
- Adjust `delayBetweenRequests` based on your API limits
- Monitor the error log for data integrity issues

## Support

For issues or questions:
1. Check the error log file for specific error messages
2. Verify your ActiveCampaign API credentials and permissions
3. Review the configuration comments in `fetch-campaigns.js`
4. Test with `isTestMode: true` first before processing all data

## License

This tool is provided as-is for data analysis purposes. Ensure compliance with ActiveCampaign's Terms of Service and API usage guidelines.