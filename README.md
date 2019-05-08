> This integration is under development and is not yet ready for use.

# Polarity Google Drive Integration

![image](https://img.shields.io/badge/status-beta-green.svg)

Polarity's Google Drive integration gives users the ability to search files stored in a specified Google drive folder. This integration leverages the v3 drive API.

![image](https://user-images.githubusercontent.com/306319/56232994-122b7980-6050-11e9-93a8-4f5565f3a5f0.png)

## Installation Instructions

Installation instructions for integrations are provided on the [PolarityIO GitHub Page](https://polarityio.github.io/).

## Configuring the Integration

You will need to configure a Google service account key and perform the following steps.

### Create the Project and Service Account

Before you can use the Polarity Google Drive Integration you will need to go to the [Google Developers Console](https://console.developers.google.com/) and create a new project. Provide a name for your project and an ID, which can be generated as well.

After the project has been created, from the left menu, select `Credentials`, then `Create credentials`. Select `Service account key` from the type of credentials list. After this, choose `New service account` from the dropdown and name the service account `polarity-gdrive`.  Under the role selection, choose `Service Accounts -> Service Account User`.  Select `JSON` as the key type and hit the `Create` button which will trigger the download of the JSON private key.

![image](images/readme1.png)

#### Enable the API

Next we need to enable the API which will be used with this service account. To do that, select Library from the left menu and then search for “Google Drive API” and press the Enable button.

![image](images/readme2.png)

#### Transfer Service Account Key to Polarity server

SSH into the Polarity Server as root and navigate to the Google Drive integration subdirectory:

```
cd /app/polarity-server/integrations/google-drive/
```

Create a new directory named `key` and upload the service account key created in Step 1 above, or optionally copy the contents of the key file into a new file named `privatekey.json`.  After the key file has uploaded or created, make the `key` directory and it's contents owned by the polarityd user:

```
chown -R polarityd:polarityd /app/polarity-server/integrations/google-drive/key/
```

> PLEASE NOTE: If the key file is not explicitly named `privatekey.json` or is placed in an alternate location, the integration configuration file (config.js) needs to be modified to reflect this change.

```
auth:{
    // Path to google drive private key file
    key: './key/privatekey.json'
}
```

## About Polarity

Polarity is a memory-augmentation platform that improves and accelerates analyst decision making.  For more information about the Polarity platform please see:

https://polarity.io/
