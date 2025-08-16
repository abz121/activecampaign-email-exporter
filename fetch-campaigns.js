require("dotenv").config();

const fetch = require("node-fetch");
const fs = require("fs/promises");

/**
 * Configuration for ActiveCampaign data fetching and processing
 *
 * Before running this script, ensure you have:
 * 1. Copied .env.example to .env
 * 2. Added your ActiveCampaign API credentials to the .env file
 */
const config = {
	// API Connection Settings (loaded from environment variables)
	baseUrl: process.env.ACTIVECAMPAIGN_BASE_URL, // Your ActiveCampaign API endpoint
	apiToken: process.env.ACTIVECAMPAIGN_API_TOKEN, // Your API token from ActiveCampaign settings

	// Processing Mode Settings
	isTestMode: true, // Set to false for production runs
	// When true: Only processes one batch (batchSize campaigns)
	// When false: Processes ALL campaigns in your account

	// Performance & Rate Limiting
	delayBetweenRequests: 1000, // Milliseconds to wait between API calls (1000ms = 1 second)
	// Increase if you hit rate limits, decrease for faster processing

	batchSize: 100, // Number of campaigns to fetch per API request
	// ActiveCampaign API limit is typically 100, don't increase

	// Logging Configuration
	logFile: "relationship_errors.log", // File where validation errors are logged
	// Useful for debugging data integrity issues

	// Campaign Filtering System
	// Controls which campaigns are included in the final output
	filterEnabled: true, // Set to false to disable all filtering and get ALL campaigns

	filters: {
		// Status Filter - Filter campaigns by their current status
		status: {
			enabled: true, // Set to false to disable status filtering
			value: 5, // Which status to include (see values below)
			/*
			  Available Status Values:
			  0: Draft      - Campaigns being created/edited
			  1: Scheduled  - Campaigns set to send at a future time
			  2: Sending    - Campaigns currently being sent
			  3: Paused     - Campaigns that were paused during sending
			  4: Stopped    - Campaigns that were manually stopped
			  5: Completed  - Campaigns that finished sending (RECOMMENDED)
			  
			  Common configurations:
			  - value: 5 (Completed) - Most common, gets campaigns that fully sent
			  - value: 1 (Scheduled) - For upcoming campaigns
			  - value: 2 (Sending) - For currently active campaigns
			*/
		},

		// Automation Filter - Distinguish between regular and automation campaigns
		automation: {
			enabled: true, // Set to false to include both automation and regular campaigns
			value: 0, // 0 = regular campaigns, 1 = automation campaigns
			/*
			  Automation Values:
			  0: Regular Campaigns    - Standard email blasts/newsletters
			  1: Automation Campaigns - Triggered/drip campaigns
			  
			  Most users want regular campaigns (value: 0) for analysis
			  Use value: 1 if you specifically need automation sequences
			*/
		},
	},
};

// Logging utility
async function logError(message) {
	const timestamp = new Date().toISOString();
	const logMessage = `${timestamp}: ${message}\n`;
	console.error(logMessage);
	await fs.appendFile(config.logFile, logMessage);
}

function campaignMatchesFilters(campaign) {
	if (!config.filterEnabled) return true;
	if (!campaign) return false;

	let matches = true;

	if (config.filters.status.enabled) {
		matches =
			matches &&
			campaign.status !== undefined &&
			campaign.status !== null &&
			parseInt(campaign.status) === config.filters.status.value;
	}

	if (config.filters.automation.enabled) {
		if (config.filters.automation.value === 0) {
			// For non-automation campaigns (value = 0), check if automation is null or missing
			matches =
				matches &&
				(campaign.automation === null ||
					campaign.automation === "0" ||
					campaign.automation === undefined);
		} else {
			// For automation campaigns (value = 1), check if automation exists and is "1"
			matches = matches && campaign.automation === "1";
		}
	}

	return matches;
}

async function fetchCampaignsWithMessages(
	offset = 0,
	limit = config.batchSize
) {
	const url = `${config.baseUrl}/api/3/campaigns?limit=${limit}&offset=${offset}&include=campaignMessage.message`;
	console.log(`Fetching from URL: ${url}`);

	const response = await fetch(url, {
		headers: {
			"Api-Token": config.apiToken,
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	return await response.json();
}

function createLookupMaps(data) {
	const maps = {
		messages: new Map(),
		campaignMessages: new Map(),
	};

	// Create message lookup map
	if (data.messages) {
		data.messages.forEach((message) => {
			maps.messages.set(message.id, message);
		});
	}

	// Create campaignMessage lookup map
	if (data.campaignMessages) {
		data.campaignMessages.forEach((campaignMessage) => {
			maps.campaignMessages.set(campaignMessage.campaign, campaignMessage);
		});
	}

	return maps;
}

function validateRelationships(campaign, campaignMessage, message) {
	const errors = [];

	if (!campaignMessage) {
		errors.push(`No campaign message found for campaign ID: ${campaign.id}`);
	}

	if (!message) {
		errors.push(`No message found for campaign ID: ${campaign.id}`);
	}

	if (campaignMessage && message && campaignMessage.messageid !== message.id) {
		errors.push(`Message ID mismatch for campaign ${campaign.id}: 
            campaignMessage.messageid (${campaignMessage.messageid}) !== message.id (${message.id})`);
	}

	return errors;
}

async function restructureCampaignData(data) {
	const { messages, campaignMessages } = createLookupMaps(data);
	const restructuredCampaigns = [];

	for (const campaign of data.campaigns) {
		try {
			// Skip campaigns that don't match filters
			if (!campaignMatchesFilters(campaign)) {
				continue;
			}

			// Find associated campaignMessage and message
			const campaignMessage = campaignMessages.get(campaign.id);
			const message = campaignMessage
				? messages.get(campaignMessage.messageid)
				: null;

			// Validate relationships
			const validationErrors = validateRelationships(
				campaign,
				campaignMessage,
				message
			);

			if (validationErrors.length > 0) {
				await Promise.all(validationErrors.map((error) => logError(error)));
			}

			// Create restructured campaign object
			const restructuredCampaign = {
				...campaign,
				message: message || null,
				campaignMessage: campaignMessage || null,
				_metadata: {
					hasValidRelationships: validationErrors.length === 0,
					validationErrors: validationErrors,
				},
			};

			restructuredCampaigns.push(restructuredCampaign);
		} catch (error) {
			await logError(
				`Error processing campaign ${campaign.id}: ${error.message}`
			);
		}
	}

	return restructuredCampaigns;
}

async function getAllCampaignsRestructured() {
	try {
		console.log("Starting campaign data restructuring process...");
		console.log(`Mode: ${config.isTestMode ? "TEST" : "PRODUCTION"}`);

		if (config.filterEnabled) {
			console.log("Filters enabled:");
			if (config.filters.status.enabled) {
				const statusMessages = {
					0: "Draft",
					1: "Scheduled",
					2: "Sending",
					3: "Paused",
					4: "Stopped",
					5: "Completed",
				};
				console.log(
					`- Status filter: ${
						statusMessages[config.filters.status.value]
					} campaigns`
				);
			}
			if (config.filters.automation.enabled) {
				console.log(
					`- Automation filter: ${
						config.filters.automation.value === 1
							? "Automation"
							: "Non-automation"
					} campaigns`
				);
			}
		}

		const startTime = Date.now();

		// Initialize tracking variables
		let offset = 0;
		let hasMore = true;
		let totalProcessed = 0;
		let totalWithErrors = 0;
		let totalFiltered = 0;
		const allRestructuredCampaigns = [];

		while (hasMore) {
			// Check test mode limit
			if (config.isTestMode && totalProcessed >= config.batchSize) {
				console.log("Test mode: Reached batch limit");
				break;
			}

			// Fetch batch of campaigns with included relationships
			const data = await fetchCampaignsWithMessages(offset, config.batchSize);

			if (!data.campaigns || data.campaigns.length === 0) {
				console.log("No more campaigns to process");
				hasMore = false;
				break;
			}

			// Restructure the batch
			const restructuredBatch = await restructureCampaignData(data);

			// Track statistics
			const batchErrors = restructuredBatch.filter(
				(campaign) => !campaign._metadata.hasValidRelationships
			).length;

			totalWithErrors += batchErrors;
			totalProcessed += data.campaigns.length;
			totalFiltered += restructuredBatch.length;

			// Add to results
			allRestructuredCampaigns.push(...restructuredBatch);

			console.log(`Batch processed:
                - Total in batch: ${data.campaigns.length}
                - Matching filters: ${restructuredBatch.length}
                - With errors: ${batchErrors}
                - Total processed: ${totalProcessed}
                - Total matching: ${totalFiltered}
                - Total with errors: ${totalWithErrors}`);

			// Prepare for next batch
			offset += config.batchSize;

			// Add delay between requests
			await new Promise((resolve) =>
				setTimeout(resolve, config.delayBetweenRequests)
			);
		}

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;

		// Save final results
		const summary = {
			totalProcessed,
			totalMatchingFilters: totalFiltered,
			totalWithErrors,
			duration,
			timestamp: new Date().toISOString(),
			isTestMode: config.isTestMode,
			filterSettings: {
				enabled: config.filterEnabled,
				status: config.filters.status,
				automation: config.filters.automation,
			},
		};

		await fs.writeFile(
			"exported_campaigns.json",
			JSON.stringify({ summary, campaigns: allRestructuredCampaigns }, null, 2)
		);

		console.log(`
Processing complete:
- Total campaigns processed: ${totalProcessed}
- Campaigns matching filters: ${totalFiltered}
- Campaigns with relationship errors: ${totalWithErrors}
- Duration: ${duration} seconds
- Results saved to: exported_campaigns.json
- Error log: ${config.logFile}
        `);

		return allRestructuredCampaigns;
	} catch (error) {
		console.error("Fatal error:", error);
		await logError(
			`Fatal error in getAllCampaignsRestructured: ${error.message}`
		);
		throw error;
	}
}

// Export functions for testing and reuse
module.exports = {
	restructureCampaignData,
	getAllCampaignsRestructured,
	createLookupMaps,
	validateRelationships,
	campaignMatchesFilters,
};

// Run if called directly
if (require.main === module) {
	getAllCampaignsRestructured()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("Failed to process campaigns:", error);
			process.exit(1);
		});
}
