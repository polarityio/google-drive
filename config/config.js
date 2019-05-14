module.exports = {
    /**
     * Name of the integration which is displayed in the Polarity integrations user interface
     *
     * @type String
     * @required
     */
    name: "Google Drive",
    /**
     * The acronym that appears in the notification window when information from this integration
     * is displayed.  Note that the acronym is included as part of each "tag" in the summary information
     * for the integration.  As a result, it is best to keep it to 4 or less characters.  The casing used
     * here will be carried forward into the notification window.
     *
     * @type String
     * @required
     */
    acronym: "GDR",
    /**
     * Description for this integration which is displayed in the Polarity integrations user interface
     *
     * @type String
     * @optional
     */
    description: "Google Drive Integration for Entity Searching",
    entityTypes: ['ip', 'email', 'domain', 'hash'],
    /**
     * An array of style files (css or less) that will be included for your integration. Any styles specified in
     * the below files can be used in your custom template.
     *
     * @type Array
     * @optional
     */
    "styles": [
        "./styles/gdrive.less"
    ],
    /**
     * Provide custom component logic and template for rendering the integration details block.  If you do not
     * provide a custom template and/or component then the integration will display data as a table of key value
     * pairs.
     *
     * @type Object
     * @optional
     */
    block: {
        component: {
            file: "./components/gdrive-block.js"
        },
        template: {
            file: "./templates/gdrive-block.hbs"
        }
    },
    summary: {
        component: {
            file: './components/gdrive-summary.js'
        },
        template: {
            file: './templates/gdrive-summary.hbs'
        }
    },
    auth:{
        // Path to google drive private key file
        key: './key/privatekey.json'
    },
    request: {
        // Provide the path to your certFile. Leave an empty string to ignore this option.
        // Relative paths are relative to the VT integration's root directory
        cert: '',
        // Provide the path to your private key. Leave an empty string to ignore this option.
        // Relative paths are relative to the VT integration's root directory
        key: '',
        // Provide the key passphrase if required.  Leave an empty string to ignore this option.
        // Relative paths are relative to the VT integration's root directory
        passphrase: '',
        // Provide the Certificate Authority. Leave an empty string to ignore this option.
        // Relative paths are relative to the VT integration's root directory
        ca: '',
        // An HTTP proxy to be used. Supports proxy Auth with Basic Auth, identical to support for
        // the url parameter (by embedding the auth info in the uri)
        proxy: ''
    },
    logging: {
        level: 'info',  //trace, debug, info, warn, error, fatal
    },
    "options": [
        {
            key: 'searchScope',
            name: 'Search Scope',
            description: 'Choose a search scope for the integration which dictates what files or Team Drives will be searched.',
            default: {
                value: 'default',
                display: '[Default] Search specific files the service user has access to'
            },
            type: 'select',
            options: [
                {
                    value: 'default',
                    display: '[Default] Search specific files the service user has access to'
                },
                {
                    value: 'drive',
                    display: '[Specific Drive] Search the specified Team Drive ID (must fill in the `Drive ID to Search` option)'
                },
                {
                    value: 'allDrives',
                    display: '[All Drives] Search all Team Drives the service user has access to'
                }
            ],
            multiple: false,
            userCanEdit: true,
            adminOnly: false
        },
        {
            "key": "driveId",
            "name": "Drive ID to Search",
            "description": "The ID of the Team Drive to search.  This option only has an effect if the `Search Scope` option is set to `[Specific Drive]`",
            "default": "",
            "type": "text",
            "userCanEdit": true,
            "adminOnly": false
        }
    ]
};
