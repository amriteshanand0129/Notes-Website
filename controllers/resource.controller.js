// Dependencies
const file = require("fs");
const mongoose = require("mongoose");

// Database model modules
const resource_model = require("../models/resources.model");
const pending_resource_model = require("../models/pending_resource.model");
const approved_contributions_model = require("../models/approved_contributions");
const rejected_contributions_model = require("../models/rejected_contribution.model");

// Resource upload controller for both User and Admin
const uploadResource = async (req, res) => {
  const filepath = req.file.path;
  const filesize = req.file.size;
  let filesize_String = filesize;
  if (filesize < 1024) {
    filesize_String = Math.floor(filesize) + " B";
  } else if (filesize < 1048576) {
    filesize_String = Math.floor(filesize / 1024) + " KB";
  } else {
    filesize_String = Math.floor(filesize / 1048576) + " MB";
  }
  const user = req.user;
  if (user.userType == "ADMIN") {
    try {
      const pdfbuffer = file.readFileSync(filepath);
      const created = await resource_model.create({
        subject_code: req.body.subject_code,
        subject_name: req.body.subject_name,
        file_name: req.body.file_name,
        description: req.body.description,
        filebuffer: pdfbuffer,
        filesize: filesize_String,
      });
      console.log("File added to database");
      res.status(201).json({
        message: "Resource Added Successfully",
        redirectTo: "/uploadResource",
      });
    } catch (err) {
      console.log("Error adding resource", err);
      res.status(401).send({
        error: "Error adding resource",
        redirectTo: "/uploadResource",
      });
    } finally {
      file.unlink(filepath, function (err) {
        if (err) console.log("Error deleting file", err);
        else console.log("File deleted succesfully");
      });
    }
  } else if (user.userType == "CUSTOMER") {
    try {
      const pdfbuffer = file.readFileSync(filepath);
      const created = await pending_resource_model.create({
        contributedBy: req.user.name,
        contributerId: req.user._id,
        subject_code: req.body.subject_code,
        subject_name: req.body.subject_name,
        file_name: req.body.file_name,
        description: req.body.description,
        filebuffer: pdfbuffer,
        filesize: filesize_String,
      });
      console.log("File added to database");
      res.status(201).send({
        message: "Thanks for Your Contribution! You can check your contribution status in Profile Tab",
        redirectTo: "/",
      });
    } catch (err) {
      console.log("Error while uploading contribution", err);
      res.status(401).send({
        error: "Error while uploading contribution",
        redirectTo: "/uploadResource",
      });
    } finally {
      file.unlink(filepath, function (err) {
        if (err) console.log("Error deleting file", err);
        else console.log("File deleted succesfully");
      });
    }
  }
};

// Accepting contribution controller for Admin
const acceptContribution = async (req, res) => {
  const user = req.user;
  try {
    const file = await pending_resource_model.findOne({ _id: req.body._id });
    const created = await resource_model.create({
      contributerId: file.contributerId,
      contributedBy: file.contributedBy,
      uploadedOn: file.createdAt,
      subject_code: req.body.subject_code,
      subject_name: req.body.subject_name,
      file_name: req.body.file_name,
      description: req.body.description,
      filebuffer: file.filebuffer,
      filesize: file.filesize,
    });
    try {
      const result = await approved_contributions_model.create({
        contributerId: created.contributerId,
        contributionId: created._id,
        status: true,
      });
    } catch (err) {
      console.log("Error while updating Approved Contributions list");
    }
    const result = await pending_resource_model.deleteOne({ _id: req.body._id });
    if (result.deletedCount == 1) {
      console.log("Pending Contribution List Updated");
    } else {
      console.log("Failed to update Pending Contribution List");
    }
    console.log("Contribution Accepted Successfully");
    res.status(201).send({
      message: "Contribution Accepted Successfully",
      redirectTo: "/"
    });
  } catch (err) {
    console.log("Error: Accepting Contribution Failed", err);
    res.status(401).send({
      error: "Error: Accepting Contribution Failed",
    });
  }
};

// Reject contribution controller for Admin
const rejectContribution = async (req, res) => {
  const user = req.user;
  try {
    const file = await pending_resource_model.findOne({ _id: req.body._id });
    const created = await rejected_contributions_model.create({
      contributerId: file.contributerId,
      uploadedOn: file.createdAt,
      subject_code: file.subject_code,
      subject_name: file.subject_name,
      file_name: file.file_name,
      description: file.description,
      remarks: req.body.remarks,
    });
    const result = await pending_resource_model.deleteOne({ _id: req.body._id });
    if (result.deletedCount == 1) {
      console.log("Pending Contribution List Updated");
    } else {
      console.log("Failed to update Pending Contribution List");
    }
    res.status(201).send({
      message: "Contribution Rejected",
    });
  } catch (err) {
    console.log("Error: Rejecting Contribution Failed", err);
    res.status(401).send({
      error: "Error: Rejecting Contribution Failed",
    });
  }
};

// Resource deletion controller for Admin
const deleteResource = async (req, res) => {
  const id = req.params.id;
  try {
    const file = await resource_model.findOne({ _id: id });
    const subjectname = file.subject_name;
    if (file.contributerId) {
      const idObject = new mongoose.Types.ObjectId(id);
      const updation = await approved_contributions_model.updateOne(
        { contributionId: idObject },
        {
          status: false,
          details: {
            subject_name: file.subject_name,
            subject_code: file.subject_code,
            file_name: file.file_name,
            description: file.description,
            uploadedOn: file.uploadedOn,
          },
        }
      );
      if (updation.modifiedCount == 1) {
        const result = await resource_model.deleteOne({ _id: id });
        if (result.deletedCount == 1) {
          res.status(201).send({
            message: "Resource Deleted",
            redirectTo: "/subject_catalog/subject/" + subjectname,
          });
        } else {
          await approved_contributions_model.updateOne(
            { contributionId: idObject },
            {
              status: true,
            }
          );
          console.log("Failed to delete Resource");
          res.status(501).send({
            error: "Failed to delete Resource",
          });
        }
      } else {
        console.log("Failed to modify Approved Contribution List");
        res.status(501).send({
          error: "Failed to modify Contribution List",
        });
      }
    } else {
      const result = await resource_model.deleteOne({ _id: id });
      if (result.deletedCount == 1) {
        console.log("Resource Deleted");
        res.status(201).send({
          message: "Resource Deleted",
          redirectTo: "/subject_catalog/subject/" + subjectname,
        });
      } else {
        console.log("Failed to delete Resource");
        res.status(501).send({
          error: "Failed to delete Resource",
        });
      }
    }
  } catch (error) {
    console.log("Failed to delete Resource", error);
    res.status(501).send({
      error: "Failed to delete Resource",
    });
  }
};

module.exports = {
  uploadResource: uploadResource,
  acceptContribution: acceptContribution,
  rejectContribution: rejectContribution,
  deleteResource: deleteResource,
};