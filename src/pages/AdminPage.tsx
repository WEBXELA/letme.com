import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Eye, LogOut, Home, Building, Users, FileText } from "lucide-react";
import { supabase, Property, Unit, Area, Address } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/ImageUpload";
import MultiImageUpload from "@/components/MultiImageUpload";
import { validateImage, generateFileName, getImageUrl, getPrimaryImageUrl, resizeAndCompressImage, stringifyImageUrls, parseImageUrls, DEFAULT_IMAGES } from "@/lib/imageUtils";

const AdminPage = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [showPropertyDialog, setShowPropertyDialog] = useState(false);
  const [showUnitDialog, setShowUnitDialog] = useState(false);
  const [showEditPropertyDialog, setShowEditPropertyDialog] = useState(false);
  const [showEditUnitDialog, setShowEditUnitDialog] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [cascadeConfirm, setCascadeConfirm] = useState<{ open: boolean; property: Property | null; unitsCount: number }>({ open: false, property: null, unitsCount: 0 });
  const [viewProperty, setViewProperty] = useState<Property | null>(null);
  const [viewUnit, setViewUnit] = useState<Unit | null>(null);
  const [showViewPropertyDialog, setShowViewPropertyDialog] = useState(false);
  const [showViewUnitDialog, setShowViewUnitDialog] = useState(false);
  // Track which property rows are expanded to show units
  const [expandedProperties, setExpandedProperties] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [propertyImage, setPropertyImage] = useState<File | null>(null);
  const [propertyImagePreview, setPropertyImagePreview] = useState<string | null>(null);
  const [unitImage, setUnitImage] = useState<File | null>(null);
  const [unitImagePreview, setUnitImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [propertyForm, setPropertyForm] = useState({
    Properties: '',
    AreaID: '',
    AddressID: '',
    PlusCode: '',
    Images: '',
    Description: ''
  });
  const [unitForm, setUnitForm] = useState({
    PropertyID: '',
    UnitName: '',
    MonthlyPrice: '',
    Available: true,
    Images: '',
    Description: ''
  });
  // Multi-image selections (not uploaded until submit)
  const [propertyImagesFiles, setPropertyImagesFiles] = useState<File[]>([]);
  const [unitImagesFiles, setUnitImagesFiles] = useState<File[]>([]);
  // Track existing images from edit mode
  const [existingPropertyImages, setExistingPropertyImages] = useState<string[]>([]);
  const [existingUnitImages, setExistingUnitImages] = useState<string[]>([]);
  // Track images to delete
  const [propertyImagesToDelete, setPropertyImagesToDelete] = useState<Set<string>>(new Set());
  const [unitImagesToDelete, setUnitImagesToDelete] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setIsAuthenticated(true);
      await ensureUserIsAdmin(session.user.id, session.user.email || '');
      fetchData();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      await ensureUserIsAdmin(data.user.id, email);
      setIsAuthenticated(true);
      fetchData();
      toast({
        title: "Login Successful",
        description: "Welcome to the admin panel.",
      });
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Invalid credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const ensureUserIsAdmin = async (userId: string, userEmail: string) => {
    try {
      const { data: existingAdmin, error: checkError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', userId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking admin status:', checkError);
        return;
      }

      if (!existingAdmin) {
        const { error: insertError } = await supabase
          .from('admin_users')
          .insert([{ id: userId, email: userEmail }]);

        if (insertError) {
          console.error('Error adding user to admin table:', insertError);
        } else {
          console.log('User automatically added to admin table:', userEmail);
        }
      }
    } catch (error) {
      console.error('Error ensuring user is admin:', error);
    }
  };

  // Image upload functions
  const uploadImage = async (file: File, bucket: string, folder: string): Promise<string> => {
    const fileName = generateFileName(file.name, folder);
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const uploadMultipleImages = async (files: File[], bucket: string, folder: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const url = await uploadImage(file, bucket, folder);
      urls.push(url);
    }
    return urls;
  };

  const handlePropertyImageSelect = (file: File) => {
    setPropertyImage(file);
    setPropertyImagePreview(URL.createObjectURL(file));
  };

  const handlePropertyImageRemove = () => {
  setPropertyImage(null);
  if (editingProperty) {
    const primaryPropImage = getPrimaryImageUrl(editingProperty.Images, 'property');
    setPropertyImagePreview(primaryPropImage && primaryPropImage !== DEFAULT_IMAGES.property ? primaryPropImage : null);
  } else {
    setPropertyImagePreview(null);
  }
  };

  const handleUnitImageSelect = (file: File) => {
    setUnitImage(file);
    setUnitImagePreview(URL.createObjectURL(file));
  };

  const handleUnitImageRemove = () => {
  setUnitImage(null);
  if (editingUnit) {
    const primaryUnitImage = getPrimaryImageUrl(editingUnit.Images, 'unit');
    setUnitImagePreview(primaryUnitImage && primaryUnitImage !== DEFAULT_IMAGES.unit ? primaryUnitImage : null);
  } else {
    setUnitImagePreview(null);
  }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setProperties([]);
    setUnits([]);
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
  };

  const fetchData = async () => {
    setDataLoading(true);
    setError(null);
    
    try {
      console.log('Fetching data...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user found');
        setIsAuthenticated(false);
        setError('No authenticated user found');
        return;
      }
      
      console.log('User authenticated:', user.email);
      console.log('User authenticated and auto-admin:', user.email);

      const { data: areasData, error: areasError } = await supabase
        .from('Areas')
        .select('*');
      
      if (areasError) {
        console.error('Error fetching areas:', areasError);
        setError(`Error fetching areas: ${areasError.message}`);
      } else {
        console.log('Areas fetched:', areasData?.length);
        setAreas(areasData || []);
      }

      const { data: addressesData, error: addressesError } = await supabase
        .from('addresses')
        .select('*');
      
      if (addressesError) {
        console.error('Error fetching addresses:', addressesError);
        setError(`Error fetching addresses: ${addressesError.message}`);
      } else {
        console.log('Addresses fetched:', addressesData?.length);
        setAddresses(addressesData || []);
      }

      const { data: propertiesData, error: propertiesError } = await supabase
        .from('Properties')
        .select(`
          *,
          areas:AreaID (AreaName),
          addresses:AddressID (Address)
        `);

      if (propertiesError) {
        console.error('Error fetching properties:', propertiesError);
        setError(`Error fetching properties: ${propertiesError.message}`);
        toast({
          title: "Error",
          description: "Failed to fetch properties. Check admin permissions.",
          variant: "destructive",
        });
      } else {
        console.log('Properties fetched:', propertiesData?.length);
        setProperties(propertiesData || []);
      }

      const { data: unitsData, error: unitsError } = await supabase
        .from('Units')
        .select(`
          *,
          properties:PropertyID (Properties)
        `);

      if (unitsError) {
        console.error('Error fetching units:', unitsError);
        setError(`Error fetching units: ${unitsError.message}`);
        toast({
          title: "Error",
          description: "Failed to fetch units. Check admin permissions.",
          variant: "destructive",
        });
      } else {
        console.log('Units fetched:', unitsData?.length);
        setUnits(unitsData || []);
      }

    } catch (error) {
      console.error('Error in fetchData:', error);
      setError(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast({
        title: "Error",
        description: "An error occurred while fetching data.",
        variant: "destructive",
      });
    } finally {
      setDataLoading(false);
    }
  };

  const handleAddProperty = async () => {
    // Validation
    if (!propertyForm.AreaID.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select an area.",
        variant: "destructive",
      });
      return;
    }
    if (!propertyForm.AddressID.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select an address.",
        variant: "destructive",
      });
      return;
    }
    if (!propertyForm.Description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a description for the property.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      let imageUrl = null;
      
      if (propertyImage) {
        imageUrl = await uploadImage(propertyImage, 'property-images', 'properties');
      }

      let additionalUrls: string[] = [];
      if (propertyImagesFiles && propertyImagesFiles.length > 0) {
        additionalUrls = await uploadMultipleImages(propertyImagesFiles, 'property-images', 'properties');
      }

      const propertyData: any = {
        Properties: propertyForm.Properties,
        AreaID: parseInt(propertyForm.AreaID),
        AddressID: parseInt(propertyForm.AddressID),
        PlusCode: propertyForm.PlusCode,
        Images: additionalUrls.length > 0 ? JSON.stringify(additionalUrls) : propertyForm.Images,
        Description: propertyForm.Description
      };

      if (imageUrl) {
        propertyData.image_url = imageUrl;
      }

      const { error } = await supabase
        .from('Properties')
        .insert([propertyData]);

      if (error) throw error;

      toast({
        title: "Property Added",
        description: "Property has been successfully added.",
      });

      setShowPropertyDialog(false);
      setPropertyForm({
        Properties: '',
        AreaID: '',
        AddressID: '',
        PlusCode: '',
        Images: '',
        Description: ''
      });
      setPropertyImage(null);
      setPropertyImagePreview(null);
      setPropertyImagesFiles([]);
      fetchData();
    } catch (error) {
      console.error('Error adding property:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add property.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAddUnit = async () => {
    // Validation
    if (!unitForm.UnitName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a unit name.",
        variant: "destructive",
      });
      return;
    }
    if (!unitForm.PropertyID.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select a property.",
        variant: "destructive",
      });
      return;
    }
    if (!unitForm.MonthlyPrice.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a monthly price.",
        variant: "destructive",
      });
      return;
    }
    if (!unitForm.Description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a description for the unit.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      // Avoid saving placeholder as stored image
      let imageUrl = (editingUnit.image_url && editingUnit.image_url !== DEFAULT_IMAGES.unit) ? editingUnit.image_url : null;
      
      if (unitImage) {
        imageUrl = await uploadImage(unitImage, 'unit-images', 'units');
      }

      let additionalUnitUrls: string[] = [];
      if (unitImagesFiles && unitImagesFiles.length > 0) {
        additionalUnitUrls = await uploadMultipleImages(unitImagesFiles, 'unit-images', 'units');
      }

      const unitData: any = {
        PropertyID: parseInt(unitForm.PropertyID),
        UnitName: unitForm.UnitName,
        MonthlyPrice: parseFloat(unitForm.MonthlyPrice),
        Available: unitForm.Available,
        Images: additionalUnitUrls.length > 0 ? JSON.stringify(additionalUnitUrls) : unitForm.Images,
        Description: unitForm.Description
      };

      if (imageUrl) {
        unitData.image_url = imageUrl;
      }

      const { error } = await supabase
        .from('Units')
        .insert([unitData]);

      if (error) throw error;

      toast({
        title: "Unit Added",
        description: "Unit has been successfully added.",
      });

      setShowUnitDialog(false);
      setUnitForm({
        PropertyID: '',
        UnitName: '',
        MonthlyPrice: '',
        Available: true,
        Images: '',
        Description: ''
      });
      setUnitImage(null);
      setUnitImagePreview(null);
      setUnitImagesFiles([]);
      fetchData();
    } catch (error) {
      console.error('Error adding unit:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add unit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProperty = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('Properties')
        .delete()
        .eq('PropertyID', propertyId);

      if (error) throw error;

      toast({
        title: "Property Deleted",
        description: "Property has been successfully deleted.",
      });

      fetchData();
    } catch (error) {
      console.error('Error deleting property:', error);
      toast({
        title: "Error",
        description: "Failed to delete property. It may have related units.",
        variant: "destructive",
      });
    }
  };

  const confirmDeleteProperty = async (property: Property) => {
    try {
      const { data: relatedUnits, error: unitsError } = await supabase
        .from('Units')
        .select('UnitID')
        .eq('PropertyID', property.PropertyID);

      if (unitsError) throw unitsError;

      if (relatedUnits && relatedUnits.length > 0) {
        setCascadeConfirm({
          open: true,
          property,
          unitsCount: relatedUnits.length
        });
      } else {
        await handleDeleteProperty(property.PropertyID);
      }
    } catch (error) {
      console.error('Error checking related units:', error);
      toast({
        title: "Error",
        description: "Failed to check related units.",
        variant: "destructive",
      });
    }
  };

  const handleCascadeDeleteProperty = async (property: Property) => {
    try {
      await supabase.from('Units').delete().eq('PropertyID', property.PropertyID);
      await supabase.from('Properties').delete().eq('PropertyID', property.PropertyID);
      setCascadeConfirm({ open: false, property: null, unitsCount: 0 });
      toast({ title: 'Deleted', description: 'Property and all related units have been deleted.' });
      fetchData();
    } catch (err) {
      console.error('Cascade delete error:', err);
      toast({ title: 'Error', description: 'Failed to delete property and its units.', variant: 'destructive' });
    }
  };

  const handleViewProperty = (property: Property) => {
    setViewProperty(property);
    setShowViewPropertyDialog(true);
  };

  const handleViewUnit = (unit: Unit) => {
    setViewUnit(unit);
    setShowViewUnitDialog(true);
  };

  const handleEditProperty = (property: Property) => {
    setEditingProperty(property);
    setPropertyForm({
      Properties: property.Properties || '',
      AreaID: property.AreaID.toString(),
      AddressID: property.AddressID.toString(),
      PlusCode: property.PlusCode || '',
      Images: property.Images || '',
      Description: property.Description || ''
    });
    
  // Parse existing images from JSON (safe) and ensure we only show property images (not unit images)
  const existingImages = parseImageUrls(property.Images).filter((i: any) => {
    if (!i) return false;
    // Exclude known unit image buckets/paths and unit placeholder
    if (i === DEFAULT_IMAGES.unit) return false;
    if (typeof i === 'string' && (i.includes('unit-images') || i.includes('/units/'))) return false;
    return true;
  });
    setExistingPropertyImages(existingImages);
    setPropertyImagesToDelete(new Set());
    
    setPropertyImage(null);
    const primaryPropImage = getPrimaryImageUrl(property.Images, 'property');
    setPropertyImagePreview(primaryPropImage && primaryPropImage !== DEFAULT_IMAGES.property ? primaryPropImage : null);
    setPropertyImagesFiles([]);
    setShowEditPropertyDialog(true);
  };

  const handleUpdateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProperty) return;

    setUploading(true);
    try {
      // Avoid treating the default placeholder as a real stored image
      let imageUrl = (editingProperty.image_url && editingProperty.image_url !== DEFAULT_IMAGES.property) ? editingProperty.image_url : null;

      if (propertyImage) {
        const fileName = generateFileName(propertyImage.name, 'property');
        const filePath = `properties/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(filePath, propertyImage);

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('property-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      // Upload additional images if provided
      let additionalUrls: string[] = [];
      if (propertyImagesFiles && propertyImagesFiles.length > 0) {
        additionalUrls = await uploadMultipleImages(propertyImagesFiles, 'property-images', 'properties');
      }

      // Filter out deleted images from existing ones
      const remainingExistingImages = existingPropertyImages.filter(img => !propertyImagesToDelete.has(img));
      
      // Combine remaining existing images with newly uploaded ones
      const allImages = [...remainingExistingImages, ...additionalUrls];

      const updateData: any = {
        Properties: propertyForm.Properties,
        AreaID: parseInt(propertyForm.AreaID),
        AddressID: parseInt(propertyForm.AddressID),
        PlusCode: propertyForm.PlusCode,
        Images: allImages.length > 0 ? JSON.stringify(allImages) : '',
        Description: propertyForm.Description
      };

      if (imageUrl) {
        updateData.image_url = imageUrl;
      }

      const { error } = await supabase
        .from('Properties')
        .update(updateData)
        .eq('PropertyID', editingProperty.PropertyID);

      if (error) {
        throw error;
      }

      setShowEditPropertyDialog(false);
      setEditingProperty(null);
      setPropertyForm({
        Properties: '',
        AreaID: '',
        AddressID: '',
        PlusCode: '',
        Images: '',
        Description: ''
      });
      setPropertyImage(null);
      setPropertyImagePreview(null);
      setPropertyImagesFiles([]);

      toast({
        title: "Property Updated",
        description: "The property has been successfully updated.",
      });

      fetchData();
    } catch (error) {
      console.error('Error updating property:', error);
      toast({
        title: "Error",
        description: "Failed to update property.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleEditUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setUnitForm({
      PropertyID: unit.PropertyID.toString(),
      UnitName: unit.UnitName || '',
      MonthlyPrice: unit.MonthlyPrice.toString(),
      Available: unit.Available,
      Images: unit.Images || '',
      Description: unit.Description || ''
    });
    
  // Parse existing images from JSON (safe)
  const existingImages = parseImageUrls(unit.Images).filter((i: any) => {
    if (!i) return false;
    // Exclude known property image buckets/paths and property placeholder
    if (i === DEFAULT_IMAGES.property) return false;
    if (typeof i === 'string' && (i.includes('property-images') || i.includes('/properties/'))) return false;
    return true;
  });
    setExistingUnitImages(existingImages);
    setUnitImagesToDelete(new Set());
    
    setUnitImage(null);
    const primaryUnitImage = getPrimaryImageUrl(unit.Images, 'unit');
    setUnitImagePreview(primaryUnitImage && primaryUnitImage !== DEFAULT_IMAGES.unit ? primaryUnitImage : null);
    setUnitImagesFiles([]);
    setShowEditUnitDialog(true);
  };

  const handleUpdateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;

    setUploading(true);
    try {
      let imageUrl = editingUnit.image_url;

      if (unitImage) {
        const fileName = generateFileName(unitImage.name, 'unit');
        const filePath = `units/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('unit-images')
          .upload(filePath, unitImage);

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('unit-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      // Upload additional images if provided
      let additionalUnitUrls: string[] = [];
      if (unitImagesFiles && unitImagesFiles.length > 0) {
        additionalUnitUrls = await uploadMultipleImages(unitImagesFiles, 'unit-images', 'units');
      }

      // Filter out deleted images from existing ones
      const remainingExistingImages = existingUnitImages.filter(img => !unitImagesToDelete.has(img));
      
      // Combine remaining existing images with newly uploaded ones
      const allImages = [...remainingExistingImages, ...additionalUnitUrls];

      const updateData: any = {
        PropertyID: parseInt(unitForm.PropertyID),
        UnitName: unitForm.UnitName,
        MonthlyPrice: parseFloat(unitForm.MonthlyPrice),
        Available: unitForm.Available,
        Images: allImages.length > 0 ? JSON.stringify(allImages) : '',
        Description: unitForm.Description
      };

      if (imageUrl) {
        updateData.image_url = imageUrl;
      }

      const { error } = await supabase
        .from('Units')
        .update(updateData)
        .eq('UnitID', editingUnit.UnitID);

      if (error) {
        throw error;
      }

      setShowEditUnitDialog(false);
      setEditingUnit(null);
      setUnitForm({
        PropertyID: '',
        UnitName: '',
        MonthlyPrice: '',
        Available: true,
        Images: '',
        Description: ''
      });
      setUnitImage(null);
      setUnitImagePreview(null);
      setUnitImagesFiles([]);
      setExistingUnitImages([]);
      setUnitImagesToDelete(new Set());

      toast({
        title: "Unit Updated",
        description: "The unit has been successfully updated.",
      });

      fetchData();
    } catch (error) {
      console.error('Error updating unit:', error);
      toast({
        title: "Error",
        description: "Failed to update unit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    try {
      const { error } = await supabase
        .from('Units')
        .delete()
        .eq('UnitID', unitId);

      if (error) throw error;

      toast({
        title: "Unit Deleted",
        description: "Unit has been successfully deleted.",
      });

      fetchData();
    } catch (error) {
      console.error('Error deleting unit:', error);
      toast({
        title: "Error",
        description: "Failed to delete unit.",
        variant: "destructive",
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Admin Login</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@letme.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Letme Properties list admin page</h1>
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            className="text-sm px-3 py-1"
          >
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Loading State */}
        {dataLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        )}

        {/* Error State */}
        {error && !dataLoading && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 font-medium">Error: {error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchData}
              className="mt-3"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Main Content - Only show when not loading and no critical errors */}
        {!dataLoading && !error && (
          <>
            {/* Properties List */}
            <div className="space-y-3 mb-8">
              {properties.map((property) => {
                const unitsForProperty = units.filter(u => u.PropertyID === property.PropertyID);
                const isExpanded = expandedProperties.has(property.PropertyID);
                return (
                  <div key={property.PropertyID} className="bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex-1">
                        <p className="text-gray-900 font-medium">
                          {property.addresses?.Address || property.Properties || `Property ${property.PropertyID}`}
                        </p>
                        <p className="text-sm text-muted-foreground">{unitsForProperty.length} units</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => {
                          const next = new Set(expandedProperties);
                          if (next.has(property.PropertyID)) next.delete(property.PropertyID); else next.add(property.PropertyID);
                          setExpandedProperties(next);
                        }}>
                          {isExpanded ? 'Hide units' : 'Show units'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEditProperty(property)}
                          className="px-3 py-1 text-sm"
                        >
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="px-3 py-1 text-sm text-red-600 border-red-200 hover:bg-red-50">
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure you want to delete this property?</AlertDialogTitle>
                              <AlertDialogDescription>
                                If this property has related units, deletion will fail. You can choose to delete the property along with all its units in the next step.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => confirmDeleteProperty(property)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t px-4 py-3">
                        {unitsForProperty.length > 0 ? (
                          <div className="space-y-2">
                            {unitsForProperty.map(u => (
                              <div key={u.UnitID} className="flex items-center justify-between bg-white rounded p-2">
                                <div>
                                  <p className="font-medium">{u.UnitName}</p>
                                  <p className="text-sm text-muted-foreground">£{u.MonthlyPrice} pcm</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="ghost" onClick={() => handleEditUnit(u)}>Edit</Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="ghost" className="text-red-600">Delete</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
                                        <AlertDialogDescription>Are you sure you want to delete this unit?</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteUnit(u.UnitID)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No units for this property.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Dialog open={showPropertyDialog} onOpenChange={setShowPropertyDialog}>
                <DialogTrigger asChild>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-medium">
                    + Add New Property
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold">Add a new property</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pr-2">
                    {/* Area Selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-gray-700">Area <span className="text-red-500">*</span></Label>
                      <div className="space-y-2">
                        {areas.map((area) => (
                          <div key={area.AreaID} className="flex items-center">
                            <input
                              type="radio"
                              id={`area-${area.AreaID}`}
                              name="area"
                              value={area.AreaID}
                              checked={propertyForm.AreaID === area.AreaID.toString()}
                              onChange={(e) => setPropertyForm(prev => ({ ...prev, AreaID: e.target.value }))}
                              className="mr-3"
                            />
                            <Label htmlFor={`area-${area.AreaID}`} className="text-sm text-gray-700">
                              {area.AreaName}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Address */}
                    <div className="space-y-2">
                      <Label htmlFor="address" className="text-sm font-medium text-gray-700">Address <span className="text-red-500">*</span></Label>
                      <Input
                        id="address"
                        value={propertyForm.AddressID ? addresses.find(a => a.AddressId.toString() === propertyForm.AddressID)?.Address || '' : ''}
                        onChange={(e) => {
                          const address = addresses.find(a => a.Address === e.target.value);
                          if (address) {
                            setPropertyForm(prev => ({ ...prev, AddressID: address.AddressId.toString() }));
                          }
                        }}
                        placeholder=""
                        className="bg-gray-50 border-gray-200"
                      />
                    </div>

                    {/* Plus Code */}
                    <div className="space-y-2">
                      <Label htmlFor="plusCode" className="text-sm font-medium text-gray-700">+ Code</Label>
                      <Input
                        id="plusCode"
                        value={propertyForm.PlusCode}
                        onChange={(e) => setPropertyForm(prev => ({ ...prev, PlusCode: e.target.value }))}
                        placeholder="JG5W+PG Weymouth"
                        className="bg-gray-50 border-gray-200"
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label htmlFor="description" className="text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></Label>
                      <Textarea
                        id="description"
                        value={propertyForm.Description}
                        onChange={(e) => setPropertyForm(prev => ({ ...prev, Description: e.target.value }))}
                        placeholder=""
                        rows={4}
                        className="bg-gray-50 border-gray-200"
                      />
                    </div>

                    {/* Multi-image Upload */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Upload Photos (max 5 photos)</Label>
                      <MultiImageUpload
                        value={propertyImagesFiles}
                        onChange={setPropertyImagesFiles}
                        type="property"
                        disabled={uploading}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => setShowPropertyDialog(false)} disabled={uploading}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddProperty} disabled={uploading} className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
                        {uploading ? "Saving..." : "Save this Property"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showUnitDialog} onOpenChange={setShowUnitDialog}>
                <DialogTrigger asChild>
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-base font-medium">
                    + Add New Unit
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold">Add a new unit</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pr-2">
                    {/* Unit Name */}
                    <div className="space-y-2">
                      <Label htmlFor="unitName" className="text-sm font-medium text-gray-700">Unit name <span className="text-red-500">*</span></Label>
                      <Input
                        id="unitName"
                        value={unitForm.UnitName}
                        onChange={(e) => setUnitForm(prev => ({ ...prev, UnitName: e.target.value }))}
                        placeholder=""
                        className="bg-gray-50 border-gray-200"
                      />
                    </div>

                    {/* Property Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="property" className="text-sm font-medium text-gray-700">Property <span className="text-red-500">*</span></Label>
                      <Select value={unitForm.PropertyID} onValueChange={(value) => setUnitForm(prev => ({ ...prev, PropertyID: value }))}>
                        <SelectTrigger className="bg-gray-50 border-gray-200">
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                        <SelectContent>
                          {properties.map((property) => (
                            <SelectItem key={property.PropertyID} value={property.PropertyID.toString()}>
                              {property.addresses?.Address || property.Properties || `Property ${property.PropertyID}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Monthly Price */}
                    <div className="space-y-2">
                      <Label htmlFor="monthlyPrice" className="text-sm font-medium text-gray-700">Monthly price <span className="text-red-500">*</span></Label>
                      <Input
                        id="monthlyPrice"
                        type="number"
                        value={unitForm.MonthlyPrice}
                        onChange={(e) => setUnitForm(prev => ({ ...prev, MonthlyPrice: e.target.value }))}
                        placeholder=""
                        step="0.01"
                        className="bg-gray-50 border-gray-200"
                      />
                    </div>

                    {/* Available */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium text-gray-700">Available</Label>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="available-yes"
                            name="available"
                            value="true"
                            checked={unitForm.Available === true}
                            onChange={() => setUnitForm(prev => ({ ...prev, Available: true }))}
                            className="mr-3"
                          />
                          <Label htmlFor="available-yes" className="text-sm text-gray-700">Yes</Label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="available-no"
                            name="available"
                            value="false"
                            checked={unitForm.Available === false}
                            onChange={() => setUnitForm(prev => ({ ...prev, Available: false }))}
                            className="mr-3"
                          />
                          <Label htmlFor="available-no" className="text-sm text-gray-700">No</Label>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label htmlFor="unitDescription" className="text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></Label>
                      <Textarea
                        id="unitDescription"
                        value={unitForm.Description}
                        onChange={(e) => setUnitForm(prev => ({ ...prev, Description: e.target.value }))}
                        placeholder=""
                        rows={4}
                        className="bg-gray-50 border-gray-200"
                      />
                    </div>

                    {/* Multi-image Upload */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Upload Photos (max 5 photos)</Label>
                      <MultiImageUpload
                        value={unitImagesFiles}
                        onChange={setUnitImagesFiles}
                        type="unit"
                        disabled={uploading}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => setShowUnitDialog(false)} disabled={uploading}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddUnit} disabled={uploading} className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
                        {uploading ? "Saving..." : "Save this Unit"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </main>

      {/* Edit Property Dialog */}
      <Dialog open={showEditPropertyDialog} onOpenChange={setShowEditPropertyDialog}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Edit Property</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateProperty} className="space-y-4 pr-2">
            {/* Area Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Area <span className="text-red-500">*</span></Label>
              <div className="space-y-2">
                {areas.map((area) => (
                  <div key={area.AreaID} className="flex items-center">
                    <input
                      type="radio"
                      id={`edit-area-${area.AreaID}`}
                      name="edit-area"
                      value={area.AreaID}
                      checked={propertyForm.AreaID === area.AreaID.toString()}
                      onChange={(e) => setPropertyForm(prev => ({ ...prev, AreaID: e.target.value }))}
                      className="mr-3"
                    />
                    <Label htmlFor={`edit-area-${area.AreaID}`} className="text-sm text-gray-700">
                      {area.AreaName}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="editAddress" className="text-sm font-medium text-gray-700">Address <span className="text-red-500">*</span></Label>
              <Input
                id="editAddress"
                value={propertyForm.AddressID ? addresses.find(a => a.AddressId.toString() === propertyForm.AddressID)?.Address || '' : ''}
                onChange={(e) => {
                  const address = addresses.find(a => a.Address === e.target.value);
                  if (address) {
                    setPropertyForm(prev => ({ ...prev, AddressID: address.AddressId.toString() }));
                  }
                }}
                placeholder=""
                className="bg-gray-50 border-gray-200"
                required
              />
            </div>

            {/* Plus Code */}
            <div className="space-y-2">
              <Label htmlFor="editPlusCode" className="text-sm font-medium text-gray-700">+ Code</Label>
              <Input
                id="editPlusCode"
                value={propertyForm.PlusCode}
                onChange={(e) => setPropertyForm(prev => ({ ...prev, PlusCode: e.target.value }))}
                placeholder="JG5W+PG Weymouth"
                className="bg-gray-50 border-gray-200"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="editDescription" className="text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></Label>
              <Textarea
                id="editDescription"
                value={propertyForm.Description}
                onChange={(e) => setPropertyForm(prev => ({ ...prev, Description: e.target.value }))}
                placeholder=""
                rows={4}
                className="bg-gray-50 border-gray-200"
              />
            </div>

            {/* Existing Images Gallery */}
            {existingPropertyImages.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Existing Photos ({existingPropertyImages.length})</Label>
                <div className="grid grid-cols-3 gap-2">
                  {existingPropertyImages.map((imageUrl, index) => (
                    <div 
                      key={index} 
                      className={`relative h-24 rounded-lg overflow-hidden border-2 ${
                        propertyImagesToDelete.has(imageUrl) 
                          ? 'border-red-500 opacity-50' 
                          : 'border-gray-200'
                      }`}
                    >
                      <img
                        src={imageUrl}
                        alt={`Existing Property ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = getImageUrl(null, 'property'); }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newSet = new Set(propertyImagesToDelete);
                          if (newSet.has(imageUrl)) {
                            newSet.delete(imageUrl);
                          } else {
                            newSet.add(imageUrl);
                          }
                          setPropertyImagesToDelete(newSet);
                        }}
                        className={`absolute top-1 right-1 p-1 rounded-full text-white text-xs font-bold ${
                          propertyImagesToDelete.has(imageUrl)
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-red-500 hover:bg-red-600'
                        }`}
                      >
                        {propertyImagesToDelete.has(imageUrl) ? '↺' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-image Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Upload New Photos (max 5 photos)</Label>
              <MultiImageUpload
                value={propertyImagesFiles}
                onChange={setPropertyImagesFiles}
                type="property"
                disabled={uploading}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowEditPropertyDialog(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploading} className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
                {uploading ? "Updating..." : "Update Property"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Unit Dialog */}
      <Dialog open={showEditUnitDialog} onOpenChange={setShowEditUnitDialog}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Edit Unit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateUnit} className="space-y-4 pr-2">
            {/* Unit Name */}
            <div className="space-y-2">
              <Label htmlFor="editUnitName" className="text-sm font-medium text-gray-700">Unit name <span className="text-red-500">*</span></Label>
              <Input
                id="editUnitName"
                value={unitForm.UnitName}
                onChange={(e) => setUnitForm(prev => ({ ...prev, UnitName: e.target.value }))}
                placeholder=""
                className="bg-gray-50 border-gray-200"
                required
              />
            </div>

            {/* Property Selection */}
            <div className="space-y-2">
              <Label htmlFor="editProperty" className="text-sm font-medium text-gray-700">Property <span className="text-red-500">*</span></Label>
              <Select value={unitForm.PropertyID} onValueChange={(value) => setUnitForm(prev => ({ ...prev, PropertyID: value }))}>
                <SelectTrigger className="bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.PropertyID} value={property.PropertyID.toString()}>
                      {property.addresses?.Address || property.Properties || `Property ${property.PropertyID}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Monthly Price */}
            <div className="space-y-2">
              <Label htmlFor="editMonthlyPrice" className="text-sm font-medium text-gray-700">Monthly price <span className="text-red-500">*</span></Label>
              <Input
                id="editMonthlyPrice"
                type="number"
                value={unitForm.MonthlyPrice}
                onChange={(e) => setUnitForm(prev => ({ ...prev, MonthlyPrice: e.target.value }))}
                placeholder=""
                step="0.01"
                className="bg-gray-50 border-gray-200"
                required
              />
            </div>

            {/* Available */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Available</Label>
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="edit-available-yes"
                    name="edit-available"
                    value="true"
                    checked={unitForm.Available === true}
                    onChange={() => setUnitForm(prev => ({ ...prev, Available: true }))}
                    className="mr-3"
                  />
                  <Label htmlFor="edit-available-yes" className="text-sm text-gray-700">Yes</Label>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="edit-available-no"
                    name="edit-available"
                    value="false"
                    checked={unitForm.Available === false}
                    onChange={() => setUnitForm(prev => ({ ...prev, Available: false }))}
                    className="mr-3"
                  />
                  <Label htmlFor="edit-available-no" className="text-sm text-gray-700">No</Label>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="editUnitDescription" className="text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></Label>
              <Textarea
                id="editUnitDescription"
                value={unitForm.Description}
                onChange={(e) => setUnitForm(prev => ({ ...prev, Description: e.target.value }))}
                placeholder=""
                rows={4}
                className="bg-gray-50 border-gray-200"
              />
            </div>

            {/* Existing Images Gallery */}
            {existingUnitImages.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Existing Photos ({existingUnitImages.length})</Label>
                <div className="grid grid-cols-3 gap-2">
                  {existingUnitImages.map((imageUrl, index) => (
                    <div 
                      key={index} 
                      className={`relative h-24 rounded-lg overflow-hidden border-2 ${
                        unitImagesToDelete.has(imageUrl) 
                          ? 'border-red-500 opacity-50' 
                          : 'border-gray-200'
                      }`}
                    >
                      <img
                        src={imageUrl}
                        alt={`Existing Unit ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = getImageUrl(null, 'unit'); }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newSet = new Set(unitImagesToDelete);
                          if (newSet.has(imageUrl)) {
                            newSet.delete(imageUrl);
                          } else {
                            newSet.add(imageUrl);
                          }
                          setUnitImagesToDelete(newSet);
                        }}
                        className={`absolute top-1 right-1 p-1 rounded-full text-white text-xs font-bold ${
                          unitImagesToDelete.has(imageUrl)
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-red-500 hover:bg-red-600'
                        }`}
                      >
                        {unitImagesToDelete.has(imageUrl) ? '↺' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-image Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Upload New Photos (max 5 photos)</Label>
              <MultiImageUpload
                value={unitImagesFiles}
                onChange={setUnitImagesFiles}
                type="unit"
                disabled={uploading}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowEditUnitDialog(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploading} className="bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
                {uploading ? "Updating..." : "Update Unit"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cascade Delete Confirmation */}
      <AlertDialog open={cascadeConfirm.open} onOpenChange={(open) => setCascadeConfirm(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Property and All Units?</AlertDialogTitle>
            <AlertDialogDescription>
              This property has {cascadeConfirm.unitsCount} related units. Deleting the property will also delete all {cascadeConfirm.unitsCount} units. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => cascadeConfirm.property && handleCascadeDeleteProperty(cascadeConfirm.property)}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPage;