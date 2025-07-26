import express from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb } from '../services/database.js';
import { 
    validateStudentCreation, 
    validateStudentUpdate, 
    createStudentDocument, 
    sanitizeStudentForResponse,
    searchStudents,
    getStudentsByClass,
    getStudentsByGrade,
    calculateStudentStats
} from '../models/student.js';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Get all students for a teacher
router.get('/', verifyToken, async (req, res) => {
    try {
        const { search, classId, grade, page = 1, limit = 50 } = req.query;
        
        const db = await getDb();
        const students = db.collection('students');
        
        let filter = { 
            teacherId: new ObjectId(req.user.userId),
            isActive: true
        };

        // Apply class filter if provided
        if (classId) {
            filter.classes = new ObjectId(classId);
        }

        // Apply grade filter if provided
        if (grade) {
            filter.grade = grade;
        }

        const options = {
            sort: { name: 1 },
            skip: (page - 1) * parseInt(limit),
            limit: parseInt(limit)
        };

        let [results, total] = await Promise.all([
            students.find(filter, options).toArray(),
            students.countDocuments(filter)
        ]);

        // Apply search filter client-side for more flexible searching
        if (search) {
            results = searchStudents(results, search);
            total = results.length;
        }

        // Populate class information
        if (results.length > 0) {
            const classes = db.collection('classes');
            const classIds = [...new Set(results.flatMap(s => s.classes || []))];
            
            if (classIds.length > 0) {
                const classData = await classes.find({
                    _id: { $in: classIds }
                }).toArray();
                
                const classMap = new Map(classData.map(c => [c._id.toString(), c]));
                
                results = results.map(student => ({
                    ...sanitizeStudentForResponse(student),
                    classDetails: (student.classes || []).map(classId => 
                        classMap.get(classId.toString())
                    ).filter(Boolean)
                }));
            }
        }

        res.json({
            students: results,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ error: 'Failed to get students' });
    }
});

// Get student by ID
router.get('/:studentId', verifyToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const db = await getDb();
        const students = db.collection('students');
        
        const student = await students.findOne({
            _id: new ObjectId(studentId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Populate class information
        if (student.classes && student.classes.length > 0) {
            const classes = db.collection('classes');
            const classData = await classes.find({
                _id: { $in: student.classes }
            }).toArray();
            
            student.classDetails = classData;
        }

        res.json({
            student: sanitizeStudentForResponse(student)
        });

    } catch (error) {
        console.error('Get student error:', error);
        res.status(500).json({ error: 'Failed to get student' });
    }
});

// Create new student
router.post('/', verifyToken, async (req, res) => {
    try {
        const studentData = req.body;
        
        // Validate input
        const validationErrors = validateStudentCreation(studentData);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: validationErrors 
            });
        }

        const db = await getDb();
        const students = db.collection('students');
        
        // Check for duplicate student name within teacher's students
        const existingStudent = await students.findOne({
            teacherId: new ObjectId(req.user.userId),
            name: { $regex: new RegExp(`^${studentData.name.trim()}$`, 'i') },
            isActive: true
        });

        if (existingStudent) {
            return res.status(409).json({ 
                error: 'A student with this name already exists' 
            });
        }

        // Create student document
        const newStudent = createStudentDocument(new ObjectId(req.user.userId), studentData);
        
        const result = await students.insertOne(newStudent);
        newStudent._id = result.insertedId;

        // If classes are specified, add student to those classes
        if (studentData.classes && studentData.classes.length > 0) {
            const classes = db.collection('classes');
            const classIds = studentData.classes.map(id => new ObjectId(id));
            
            await classes.updateMany(
                { 
                    _id: { $in: classIds },
                    teacherId: new ObjectId(req.user.userId)
                },
                { 
                    $addToSet: { students: result.insertedId },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        res.status(201).json({
            message: 'Student created successfully',
            student: sanitizeStudentForResponse(newStudent)
        });

    } catch (error) {
        console.error('Create student error:', error);
        res.status(500).json({ error: 'Failed to create student' });
    }
});

// Update student
router.put('/:studentId', verifyToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        const updateData = req.body;
        
        // Validate input
        const validationErrors = validateStudentUpdate(updateData);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: validationErrors 
            });
        }

        const db = await getDb();
        const students = db.collection('students');
        
        // Check if student exists and belongs to teacher
        const existingStudent = await students.findOne({
            _id: new ObjectId(studentId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!existingStudent) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Prepare update data
        const updateFields = {
            updatedAt: new Date()
        };

        if (updateData.name) updateFields.name = updateData.name.trim();
        if (updateData.grade) updateFields.grade = updateData.grade;
        if (updateData.email !== undefined) updateFields.email = updateData.email.toLowerCase().trim();
        if (updateData.parentContact) updateFields.parentContact = updateData.parentContact;
        if (updateData.notes !== undefined) updateFields.notes = updateData.notes.trim();
        if (updateData.isActive !== undefined) updateFields.isActive = updateData.isActive;

        // Handle class updates separately if provided
        if (updateData.classes) {
            const classes = db.collection('classes');
            const newClassIds = updateData.classes.map(id => new ObjectId(id));
            const oldClassIds = existingStudent.classes || [];

            // Remove student from old classes
            if (oldClassIds.length > 0) {
                await classes.updateMany(
                    { _id: { $in: oldClassIds } },
                    { 
                        $pull: { students: new ObjectId(studentId) },
                        $set: { updatedAt: new Date() }
                    }
                );
            }

            // Add student to new classes
            if (newClassIds.length > 0) {
                await classes.updateMany(
                    { 
                        _id: { $in: newClassIds },
                        teacherId: new ObjectId(req.user.userId)
                    },
                    { 
                        $addToSet: { students: new ObjectId(studentId) },
                        $set: { updatedAt: new Date() }
                    }
                );
            }

            updateFields.classes = newClassIds;
        }

        // Update student
        await students.updateOne(
            { _id: new ObjectId(studentId) },
            { $set: updateFields }
        );

        // Get updated student
        const updatedStudent = await students.findOne({
            _id: new ObjectId(studentId)
        });

        res.json({
            message: 'Student updated successfully',
            student: sanitizeStudentForResponse(updatedStudent)
        });

    } catch (error) {
        console.error('Update student error:', error);
        res.status(500).json({ error: 'Failed to update student' });
    }
});

// Delete student (soft delete)
router.delete('/:studentId', verifyToken, async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const db = await getDb();
        const students = db.collection('students');
        
        // Check if student exists and belongs to teacher
        const student = await students.findOne({
            _id: new ObjectId(studentId),
            teacherId: new ObjectId(req.user.userId)
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Soft delete - set isActive to false
        await students.updateOne(
            { _id: new ObjectId(studentId) },
            { 
                $set: { 
                    isActive: false,
                    updatedAt: new Date()
                }
            }
        );

        // Remove student from all classes
        if (student.classes && student.classes.length > 0) {
            const classes = db.collection('classes');
            await classes.updateMany(
                { _id: { $in: student.classes } },
                { 
                    $pull: { students: new ObjectId(studentId) },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        res.json({ message: 'Student deleted successfully' });

    } catch (error) {
        console.error('Delete student error:', error);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

// Get student statistics
router.get('/stats/overview', verifyToken, async (req, res) => {
    try {
        const db = await getDb();
        const students = db.collection('students');
        
        const studentList = await students.find({
            teacherId: new ObjectId(req.user.userId),
            isActive: true
        }).toArray();

        const stats = calculateStudentStats(studentList);
        
        res.json({ stats });

    } catch (error) {
        console.error('Get student stats error:', error);
        res.status(500).json({ error: 'Failed to get student statistics' });
    }
});

// Search students for dropdown
router.get('/search/dropdown', verifyToken, async (req, res) => {
    try {
        const { q, classId, limit = 20 } = req.query;
        
        const db = await getDb();
        const students = db.collection('students');
        
        let filter = { 
            teacherId: new ObjectId(req.user.userId),
            isActive: true
        };

        if (classId) {
            filter.classes = new ObjectId(classId);
        }

        let results = await students.find(filter, {
            sort: { name: 1 },
            limit: parseInt(limit)
        }).toArray();

        // Apply search filter
        if (q) {
            results = searchStudents(results, q);
        }

        // Format for dropdown
        const dropdownOptions = results.map(student => ({
            value: student._id.toString(),
            label: student.name,
            grade: student.grade,
            classes: student.classes || []
        }));

        res.json({
            options: dropdownOptions,
            hasMore: results.length === parseInt(limit)
        });

    } catch (error) {
        console.error('Search students error:', error);
        res.status(500).json({ error: 'Failed to search students' });
    }
});

export default router;