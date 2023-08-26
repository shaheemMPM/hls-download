const axios = require("axios");
const fs = require("fs");
const { spawnSync } = require("child_process");
const ProgressBar = require("cli-progress");
const readline = require("readline");
const { URL } = require("url");
const path = require("path");

// Create a readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to prompt the user for input
function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function downloadSegmentsAndCombine() {
  try {
    const playlistUrl = await promptUser("Enter the playlist URL: ");
    let outputFileName = await promptUser("Enter the output file name: ");

    outputFileName = `./outputs/${outputFileName}.mp4`;

    // Parse the playlist URL to get the hostname
    const parsedUrl = new URL(playlistUrl);
    const hostname = parsedUrl.origin;

    const response = await axios.get(playlistUrl);
    const playlistContent = response.data;

    const segmentUrls = playlistContent.match(/\/records\/\d+\/.+\.ts/g);
    if (!segmentUrls) {
      console.log("No segment URLs found in the playlist.");
      return;
    }

    if (!fs.existsSync(".segments")) {
      fs.mkdirSync(".segments");
    }

    const downloadedSegments = [];

    const progressBar = new ProgressBar.SingleBar(
      {
        format: "Downloading segments [{bar}] {percentage}% | {value}/{total}",
        stopOnComplete: true,
      },
      ProgressBar.Presets.shades_classic
    );

    progressBar.start(segmentUrls.length, 0);

    for (const segmentUrl of segmentUrls) {
      const fullSegmentUrl = `${hostname}${segmentUrl}`;
      const segmentResponse = await axios.get(fullSegmentUrl, {
        responseType: "arraybuffer",
      });
      const segmentData = segmentResponse.data;
      const segmentFileName = path.join(
        ".segments",
        segmentUrl.split("/").pop()
      );
      fs.writeFileSync(segmentFileName, segmentData);
      downloadedSegments.push(segmentFileName);
      progressBar.increment();
    }

    progressBar.stop();

    const concatCommand = downloadedSegments
      .map((segment) => `file '${segment}'`)
      .join("\n");
    fs.writeFileSync("concat.txt", concatCommand);

    const ffmpegArgs = [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.txt",
      "-c",
      "copy",
      outputFileName,
    ];
    spawnSync("ffmpeg", ffmpegArgs);

    console.log(`Combined segments into ${outputFileName}`);

    // Cleanup downloaded files and concat.txt
    downloadedSegments.forEach((segment) => fs.unlinkSync(segment));
    fs.unlinkSync("concat.txt");

    if (!fs.existsSync("outputs")) {
      fs.mkdirSync("outputs");
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    rl.close(); // Close the readline interface
  }
}

downloadSegmentsAndCombine();
